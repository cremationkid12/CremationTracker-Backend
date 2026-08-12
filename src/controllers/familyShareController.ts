import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import { CaseServiceError, type CaseService } from "../services/caseService";
import type { FamilyLinkMailer } from "../services/familyLinkMailer";
import type { OrgService } from "../services/orgService";

export type FamilyShareControllerDeps = {
  caseService: CaseService;
  orgService: OrgService;
  familyLinkMailer: FamilyLinkMailer;
};

function mapServiceError(res: Response, error: unknown): void {
  if (error instanceof CaseServiceError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : error.code === "conflict"
            ? 409
            : 400;
    res.status(status).json({ error: error.code, message: error.message });
    return;
  }
  res.status(400).json({
    error: "request_failed",
    message: error instanceof Error ? error.message : "Request failed.",
  });
}

export async function postFamilyShareEmail(
  req: AuthenticatedRequest,
  res: Response,
  deps: FamilyShareControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (req.auth.orgType !== "funeral_home") {
    res.status(403).json({
      error: "forbidden",
      message: "Only funeral homes can share family links.",
    });
    return;
  }

  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!caseId || !email || !email.includes("@")) {
    res.status(400).json({
      error: "bad_request",
      message: "caseId and a valid email are required.",
    });
    return;
  }

  try {
    const detail = await deps.caseService.getCase(req.auth.orgId, req.auth.orgType, caseId);
    if (!detail) {
      res.status(404).json({ error: "not_found", message: "Case not found." });
      return;
    }
    if (detail.case_mode !== "live") {
      res.status(400).json({
        error: "bad_request",
        message: "Test cases do not have family links.",
      });
      return;
    }
    if (!detail.family_token || !detail.family_url) {
      res.status(409).json({
        error: "conflict",
        message: "Family link is not available yet. Complete payment if this case is pending.",
      });
      return;
    }

    const org = await deps.orgService.getOrganization(req.auth.orgId);
    const result = await deps.familyLinkMailer.sendFamilyLink({
      email,
      familyToken: detail.family_token,
      decedentDisplayName: detail.decedent_display_name,
      funeralHomeName: org?.name ?? "your funeral home",
      senderName: req.auth.name,
    });

    res.status(202).json({
      email,
      family_url: result.family_url,
      delivered: result.delivered,
    });
  } catch (error) {
    mapServiceError(res, error);
  }
}
