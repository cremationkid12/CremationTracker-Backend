import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { CaseMode, CaseService, CaseStatus } from "../services/caseService";

export type CaseControllerDeps = {
  caseService: CaseService;
};

export async function listCases(
  req: AuthenticatedRequest,
  res: Response,
  deps: CaseControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }

  const status =
    typeof req.query.status === "string" && ["active", "completed", "archived"].includes(req.query.status)
      ? (req.query.status as CaseStatus)
      : undefined;
  const caseMode =
    typeof req.query.case_mode === "string" && ["test", "live"].includes(req.query.case_mode)
      ? (req.query.case_mode as CaseMode)
      : undefined;

  const result = await deps.caseService.listCases(req.auth.orgId, { status, caseMode });
  res.status(200).json(result);
}

export async function createCase(
  req: AuthenticatedRequest,
  res: Response,
  deps: CaseControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (req.auth.orgType !== "funeral_home") {
    res.status(403).json({
      error: "forbidden",
      message: "Only funeral homes can create cases.",
    });
    return;
  }

  const caseMode = req.body?.case_mode;
  const decedentDisplayName =
    typeof req.body?.decedent_display_name === "string"
      ? req.body.decedent_display_name.trim()
      : "";
  const intake =
    req.body?.intake && typeof req.body.intake === "object" && !Array.isArray(req.body.intake)
      ? (req.body.intake as Record<string, unknown>)
      : {};

  if ((caseMode !== "test" && caseMode !== "live") || !decedentDisplayName) {
    res.status(400).json({
      error: "bad_request",
      message: "case_mode (test|live) and decedent_display_name are required.",
    });
    return;
  }

  try {
    const created = await deps.caseService.createCase({
      ownerOrgId: req.auth.orgId,
      createdByUserId: req.auth.userId,
      caseMode,
      decedentDisplayName,
      intake,
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({
      error: "create_failed",
      message: error instanceof Error ? error.message : "Could not create case.",
    });
  }
}

export async function getCase(
  req: AuthenticatedRequest,
  res: Response,
  deps: CaseControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  if (!caseId) {
    res.status(400).json({ error: "bad_request", message: "caseId is required." });
    return;
  }

  const detail = await deps.caseService.getCase(req.auth.orgId, caseId);
  if (!detail) {
    res.status(404).json({ error: "not_found", message: "Case not found." });
    return;
  }
  res.status(200).json(detail);
}
