import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import {
  AuthFailedError,
  AuthNotConfiguredError,
  type AuthService,
} from "../services/authService";
import type { OrgService } from "../services/orgService";
import type { OrgType } from "../types/domain";

export type AuthControllerDeps = {
  authService: AuthService;
  orgService: OrgService;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseOrgType(value: unknown): OrgType | null {
  if (value === "funeral_home" || value === "crematory") return value;
  return null;
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

  if (!name || !email || !isValidEmail(email) || password.length < 8 || !orgType || !orgName) {
    res.status(400).json({
      error: "bad_request",
      message:
        "name, valid email, password (min 8), org_type (funeral_home|crematory), and org_name are required.",
    });
    return;
  }

  try {
    const session = await deps.authService.register(email, password, name);
    const membership = await deps.orgService.bootstrapOrgAndAdmin({
      userId: session.user_id,
      email,
      name,
      orgType,
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

  if (!email || !isValidEmail(email) || !password) {
    res.status(400).json({
      error: "bad_request",
      message: "Valid email and password are required.",
    });
    return;
  }

  try {
    const session = await deps.authService.login(email, password);
    const membership = await deps.orgService.findOrgRoleByUserId(session.user_id);
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
    res.status(401).json({
      error: "unauthorized",
      message: error instanceof Error ? error.message : "Login failed.",
    });
  }
}
