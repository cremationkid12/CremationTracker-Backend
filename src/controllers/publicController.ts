import type { Request, Response } from "express";
import type { CaseService } from "../services/caseService";
import { CaseServiceError } from "../services/caseService";

export type PublicControllerDeps = {
  caseService: CaseService;
};

export async function getFamilyByPin(
  req: Request,
  res: Response,
  deps: PublicControllerDeps,
): Promise<void> {
  const pin = typeof req.query.pin === "string" ? req.query.pin.trim() : "";
  if (!pin) {
    res.status(400).json({ error: "bad_request", message: "pin query parameter is required." });
    return;
  }
  try {
    const status = await deps.caseService.getFamilyStatusByPin(pin);
    res.status(200).json(status);
  } catch (error) {
    if (error instanceof CaseServiceError) {
      res.status(error.code === "not_found" ? 404 : 400).json({
        error: error.code,
        message: error.message,
      });
      return;
    }
    res.status(400).json({
      error: "request_failed",
      message: error instanceof Error ? error.message : "Request failed.",
    });
  }
}

export async function getFamilyByToken(
  req: Request,
  res: Response,
  deps: PublicControllerDeps,
): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "bad_request", message: "token is required." });
    return;
  }
  try {
    const status = await deps.caseService.getFamilyStatusByToken(token);
    res.status(200).json(status);
  } catch (error) {
    if (error instanceof CaseServiceError) {
      res.status(error.code === "not_found" ? 404 : 400).json({
        error: error.code,
        message: error.message,
      });
      return;
    }
    res.status(400).json({
      error: "request_failed",
      message: error instanceof Error ? error.message : "Request failed.",
    });
  }
}
