import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { InviteMailer } from "../services/inviteMailer";
import { InviteError, type InviteService } from "../services/inviteService";

export type StaffInviteControllerDeps = {
  inviteService: InviteService;
  inviteMailer: InviteMailer;
};

function mapInviteError(res: Response, error: unknown): void {
  if (error instanceof InviteError) {
    const status =
      error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : 400;
    res.status(status).json({ error: error.code, message: error.message });
    return;
  }
  res.status(400).json({
    error: "invite_failed",
    message: error instanceof Error ? error.message : "Invite failed.",
  });
}

export async function postStaffInvite(
  req: AuthenticatedRequest,
  res: Response,
  deps: StaffInviteControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (req.auth.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Only admins can invite staff." });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const role = req.body?.role === "admin" ? "admin" : "associate";
  if (!email) {
    res.status(400).json({ error: "bad_request", message: "email is required." });
    return;
  }

  try {
    const created = await deps.inviteService.createInvite({
      orgId: req.auth.orgId,
      invitedByUserId: req.auth.userId,
      email,
      role,
    });
    await deps.inviteMailer.sendInvite({
      email: created.email,
      inviteToken: created.invite_token,
      orgName: "your organization",
      inviterName: req.auth.name,
    });
    res.status(202).json({
      status: created.status,
      email: created.email,
      org_id: created.org_id,
      expires_at: created.expires_at,
      invite_token: created.invite_token,
    });
  } catch (error) {
    mapInviteError(res, error);
  }
}

export async function getInvitePreview(
  req: { params: { token?: string } },
  res: Response,
  inviteService: InviteService,
): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  if (!token) {
    res.status(400).json({ error: "bad_request", message: "token is required." });
    return;
  }
  try {
    const preview = await inviteService.previewInvite(token);
    res.status(200).json(preview);
  } catch (error) {
    mapInviteError(res, error);
  }
}

export async function postAcceptInvite(
  req: AuthenticatedRequest,
  res: Response,
  inviteService: InviteService,
): Promise<void> {
  if (!req.auth?.userId) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  const token =
    typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "bad_request", message: "invite_token is required." });
    return;
  }
  try {
    const membership = await inviteService.acceptInvite({
      rawToken: token,
      userId: req.auth.userId,
      email: req.auth.email,
      name: req.auth.name,
    });
    res.status(200).json({
      org_id: membership.org_id,
      org_type: membership.org_type,
      role: membership.role,
      email: membership.email,
      name: membership.name,
    });
  } catch (error) {
    mapInviteError(res, error);
  }
}
