import { Router } from "express";
import type { Request, Response } from "express";
import { createRequireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import {
  getCredits,
  startCaseCheckout,
  type BillingControllerDeps,
} from "../controllers/billingController";

export function createBillingRouter(services: AppServices): Router {
  const router = Router();
  const requireAuth = createRequireAuth(services.orgService);
  const deps: BillingControllerDeps = { billingService: services.billingService };

  router.get("/credits", requireAuth, (req: Request, res: Response) =>
    getCredits(req as AuthenticatedRequest, res, deps),
  );

  return router;
}

export function createCaseBillingRouter(services: AppServices): Router {
  const router = Router({ mergeParams: true });
  const requireAuth = createRequireAuth(services.orgService);
  const deps: BillingControllerDeps = { billingService: services.billingService };

  router.post("/checkout", requireAuth, (req: Request, res: Response) =>
    startCaseCheckout(req as AuthenticatedRequest, res, deps),
  );

  return router;
}
