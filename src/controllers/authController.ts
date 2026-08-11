import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import { isSupabaseAuthConfigured } from "../auth/supabaseAccessTokenUser";
import { hasDatabase } from "../db/pool";
import {
  AuthFailedError,
  AuthNotConfiguredError,
  type AuthService,
} from "../services/authService";
import { InviteError, type InviteService } from "../services/inviteService";
import type { OrgService } from "../services/orgService";
import type { OrgType } from "../types/domain";

export type AuthControllerDeps = {
  authService: AuthService;
  orgService: OrgService;
  inviteService: InviteService;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseOrgType(value: unknown): OrgType | null {
  if (value === "funeral_home" || value === "crematory") return value;
  return null;
}

function requirePersistentDbForSupabase(res: Response): boolean {
  if (isSupabaseAuthConfigured() && !hasDatabase()) {
    res.status(503).json({
      error: "service_unavailable",
      message:
        "DATABASE_URL is required when Supabase auth is configured. Use a dedicated Cremation Tracker Postgres (Supabase) project.",
    });
    return false;
  }
  return true;
}

export function getAuthMe(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({
    user_id: req.auth?.userId,
    email: req.auth?.email,
    name: req.auth?.name,
    org_id: req.auth?.orgId,
    org_type: req.auth?.orgType,
    role: req.auth?.role,
  });
}

export async function postRegister(
  req: Request,
  res: Response,
  deps: AuthControllerDeps,
): Promise<void> {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const orgName = typeof req.body?.org_name === "string" ? req.body.org_name.trim() : "";
  const orgType = parseOrgType(req.body?.org_type);
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : undefined;
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : undefined;
  const inviteToken =
    typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";

  if (!name || !email || !isValidEmail(email) || password.length < 8) {
    res.status(400).json({
      error: "bad_request",
      message: "name, valid email, and password (min 8) are required.",
    });
    return;
  }

  if (!inviteToken && (!orgType || !orgName)) {
    res.status(400).json({
      error: "bad_request",
      message:
        "org_type (funeral_home|crematory) and org_name are required unless joining with invite_token.",
    });
    return;
  }

  if (!requirePersistentDbForSupabase(res)) return;

  try {
    const session = await deps.authService.register(email, password, name);
    const membership = inviteToken
      ? await deps.inviteService.acceptInvite({
          rawToken: inviteToken,
          userId: session.user_id,
          email,
          name,
        })
      : await deps.orgService.bootstrapOrgAndAdmin({
          userId: session.user_id,
          email,
          name,
          orgType: orgType!,
          orgName,
          phone,
          address,
        });
    res.status(201).json({
      ...session,
      user: {
        user_id: session.user_id,
        email: membership.email,
        name: membership.name,
        org_id: membership.org_id,
        org_type: membership.org_type,
        role: membership.role,
      },
    });
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ error: "service_unavailable", message: error.message });
      return;
    }
    if (error instanceof InviteError) {
      res.status(error.code === "not_found" ? 404 : 400).json({
        error: error.code,
        message: error.message,
      });
      return;
    }
    if (error instanceof AuthFailedError) {
      res.status(400).json({ error: "auth_failed", message: error.message });
      return;
    }
    res.status(400).json({
      error: "auth_failed",
      message: error instanceof Error ? error.message : "Register failed.",
    });
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  deps: AuthControllerDeps,
): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const inviteToken =
    typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";

  if (!email || !isValidEmail(email) || !password) {
    res.status(400).json({
      error: "bad_request",
      message: "Valid email and password are required.",
    });
    return;
  }

  if (!requirePersistentDbForSupabase(res)) return;

  try {
    const session = await deps.authService.login(email, password);
    let membership = await deps.orgService.findOrgRoleByUserId(session.user_id);
    if (inviteToken) {
      membership = await deps.inviteService.acceptInvite({
        rawToken: inviteToken,
        userId: session.user_id,
        email,
        name: membership?.name || email.split("@")[0],
      });
    }
    if (!membership) {
      res.status(401).json({
        error: "unauthorized",
        message: "Account is not provisioned for this app.",
      });
      return;
    }
    res.status(200).json({
      ...session,
      user: {
        user_id: session.user_id,
        email: membership.email,
        name: membership.name,
        org_id: membership.org_id,
        org_type: membership.org_type,
        role: membership.role,
      },
    });
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ error: "service_unavailable", message: error.message });
      return;
    }
    if (error instanceof InviteError) {
      res.status(error.code === "not_found" ? 404 : 400).json({
        error: error.code,
        message: error.message,
      });
      return;
    }
    res.status(401).json({
      error: "unauthorized",
      message: error instanceof Error ? error.message : "Login failed.",
    });
  }
}

export async function postRefresh(
  req: Request,
  res: Response,
  authService: AuthService,
): Promise<void> {
  const refreshToken =
    typeof req.body?.refresh_token === "string" ? req.body.refresh_token.trim() : "";
  if (!refreshToken) {
    res.status(400).json({ error: "bad_request", message: "refresh_token is required." });
    return;
  }
  if (!authService.refresh) {
    res.status(501).json({
      error: "not_implemented",
      message: "Token refresh requires Supabase auth.",
    });
    return;
  }
  try {
    const session = await authService.refresh(refreshToken);
    res.status(200).json(session);
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ error: "service_unavailable", message: error.message });
      return;
    }
    res.status(401).json({
      error: "unauthorized",
      message: error instanceof Error ? error.message : "Refresh failed.",
    });
  }
}
