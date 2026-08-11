import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import { CaseServiceError } from "../services/caseService";
import type { BillingService } from "../services/billingService";

export type BillingControllerDeps = {
  billingService: BillingService;
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

export async function getCredits(
  req: AuthenticatedRequest,
  res: Response,
  deps: BillingControllerDeps,
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (req.auth.orgType !== "funeral_home") {
    res.status(403).json({
      error: "forbidden",
      message: "Only funeral homes have case credits.",
    });
    return;
  }
  try {
    const credits = await deps.billingService.getCredits(req.auth.orgId);
    res.status(200).json(credits);
  } catch (error) {
    mapServiceError(res, error);
  }
}

export async function startCaseCheckout(
  req: AuthenticatedRequest,
  res: Response,
  deps: BillingControllerDeps,
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
  try {
    const result = await deps.billingService.startCheckout({
      orgId: req.auth.orgId,
      orgType: req.auth.orgType,
      caseId,
    });
    res.status(200).json(result);
  } catch (error) {
    mapServiceError(res, error);
  }
}

export async function stripeWebhook(
  req: AuthenticatedRequest | { body: Buffer; headers: Record<string, unknown> },
  res: Response,
  deps: BillingControllerDeps,
): Promise<void> {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "");
    const signatureHeader = req.headers["stripe-signature"];
    const signature =
      typeof signatureHeader === "string"
        ? signatureHeader
        : Array.isArray(signatureHeader)
          ? signatureHeader[0]
          : undefined;
    await deps.billingService.handleStripeWebhook(rawBody, signature);
    res.status(200).json({ received: true });
  } catch (error) {
    mapServiceError(res, error);
  }
}
