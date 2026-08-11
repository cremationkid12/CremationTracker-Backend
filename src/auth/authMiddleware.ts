import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { OrgService } from "../services/orgService";
import type { MemberRole, OrgType } from "../types/domain";
import {
  getUserFromSupabaseAccessToken,
  isSupabaseAuthConfigured,
} from "./supabaseAccessTokenUser";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    role: MemberRole;
    orgId: string;
    orgType: OrgType;
    email: string;
    name: string;
  };
};

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  full_name?: string;
};

async function resolveUserIdFromBearer(token: string): Promise<{
  userId: string;
  email: string;
  name: string;
} | null> {
  const secret = process.env.JWT_SECRET?.trim();
  const header = jwt.decode(token, { complete: true })?.header;
  const alg = header?.alg;

  if (alg === "HS256" && secret) {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (!decoded.sub) return null;
    return {
      userId: decoded.sub,
      email: decoded.email ?? "",
      name: decoded.full_name ?? decoded.name ?? "",
    };
  }

  const user = await getUserFromSupabaseAccessToken(token);
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    name:
      user.user_metadata?.full_name?.toString().trim() ||
      user.user_metadata?.name?.toString().trim() ||
      "",
  };
}

/** Auth required, org membership optional (invite accept). */
export function createRequireAuthUser(orgService: OrgService) {
  return async function requireAuthUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
      return;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
      return;
    }

    try {
      const identity = await resolveUserIdFromBearer(token);
      if (!identity) {
        if (isSupabaseAuthConfigured() || process.env.JWT_SECRET?.trim()) {
          res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
          return;
        }
        res.status(503).json({
          error: "auth_not_configured",
          message: "Authentication is not configured.",
        });
        return;
      }

      const membership = await orgService.findOrgRoleByUserId(identity.userId);
      req.auth = {
        userId: identity.userId,
        role: membership?.role ?? "associate",
        orgId: membership?.org_id ?? "",
        orgType: membership?.org_type ?? "funeral_home",
        email: membership?.email || identity.email,
        name: membership?.name || identity.name,
      };
      next();
    } catch {
      res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
    }
  };
}

export function createRequireAuth(orgService: OrgService) {
  return async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
      return;
    }

    const secret = process.env.JWT_SECRET?.trim();

    try {
      const header = jwt.decode(token, { complete: true })?.header;
      const alg = header?.alg;

      if (alg === "HS256" && secret) {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        const userId = decoded.sub;
        if (!userId) {
          res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
          return;
        }

        const membership = await orgService.findOrgRoleByUserId(userId);
        if (!membership) {
          res.status(401).json({
            error: "unauthorized",
            message: "Account is not provisioned. Register to create your organization.",
          });
          return;
        }

        req.auth = {
          userId,
          role: membership.role,
          orgId: membership.org_id,
          orgType: membership.org_type,
          email: membership.email,
          name: membership.name,
        };
        next();
        return;
      }

      const user = await getUserFromSupabaseAccessToken(token);
      if (user) {
        const membership = await orgService.findOrgRoleByUserId(user.id);
        if (!membership) {
          res.status(401).json({
            error: "unauthorized",
            message: "Account is not provisioned. Register to create your organization.",
          });
          return;
        }

        req.auth = {
          userId: user.id,
          role: membership.role,
          orgId: membership.org_id,
          orgType: membership.org_type,
          email: membership.email || user.email || "",
          name:
            membership.name ||
            user.user_metadata?.full_name?.toString().trim() ||
            user.user_metadata?.name?.toString().trim() ||
            "",
        };
        next();
        return;
      }

      if (isSupabaseAuthConfigured()) {
        res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
        return;
      }

      if (!secret) {
        res.status(503).json({
          error: "auth_not_configured",
          message: "Authentication is not configured (JWT_SECRET or Supabase keys missing).",
        });
        return;
      }

      res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
    } catch {
      res.status(401).json({ error: "unauthorized", message: "Invalid authentication token." });
    }
  };
}
