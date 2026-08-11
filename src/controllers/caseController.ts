import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import {
  CaseServiceError,
  type CaseMode,
  type CaseService,
  type CaseStatus,
} from "../services/caseService";

export type CaseControllerDeps = {
  caseService: CaseService;
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
    typeof req.query.status === "string" &&
    ["active", "completed", "archived"].includes(req.query.status)
      ? (req.query.status as CaseStatus)
      : undefined;
  const caseMode =
    typeof req.query.case_mode === "string" && ["test", "live"].includes(req.query.case_mode)
      ? (req.query.case_mode as CaseMode)
      : undefined;

  const result = await deps.caseService.listCases(req.auth.orgId, req.auth.orgType, {
    status,
    caseMode,
  });
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
    mapServiceError(res, error);
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

  const detail = await deps.caseService.getCase(req.auth.orgId, req.auth.orgType, caseId);
  if (!detail) {
    res.status(404).json({ error: "not_found", message: "Case not found." });
    return;
  }
  res.status(200).json(detail);
}

export async function postCaseStep(
  req: AuthenticatedRequest,
  res: Response,
  deps: CaseControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  const stepCode = typeof req.body?.step_code === "string" ? req.body.step_code.trim() : "";
  const note = typeof req.body?.note === "string" ? req.body.note : undefined;
  if (!caseId || !stepCode) {
    res.status(400).json({
      error: "bad_request",
      message: "caseId and step_code are required.",
    });
    return;
  }

  try {
    const detail = await deps.caseService.recordStep({
      orgId: req.auth.orgId,
      orgType: req.auth.orgType,
      userId: req.auth.userId,
      caseId,
      stepCode,
      note,
    });
    res.status(201).json(detail);
  } catch (error) {
    mapServiceError(res, error);
  }
}

export async function claimCase(
  req: AuthenticatedRequest,
  res: Response,
  deps: CaseControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (req.auth.orgType !== "crematory") {
    res.status(403).json({
      error: "forbidden",
      message: "Only crematories can claim cases.",
    });
    return;
  }

  const qrToken = typeof req.body?.qr_token === "string" ? req.body.qr_token.trim() : undefined;
  const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : undefined;
  if (!qrToken && !pin) {
    res.status(400).json({
      error: "bad_request",
      message: "qr_token or pin is required.",
    });
    return;
  }

  try {
    const detail = await deps.caseService.claimCase({
      crematoryOrgId: req.auth.orgId,
      userId: req.auth.userId,
      qrToken,
      pin,
    });
    res.status(200).json(detail);
  } catch (error) {
    mapServiceError(res, error);
  }
}
