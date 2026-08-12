import { Router } from "express";
import type { Request, Response } from "express";
import { createRequireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import {
  postFamilyShareEmail,
  type FamilyShareControllerDeps,
} from "../controllers/familyShareController";

export function createCaseFamilyShareRouter(services: AppServices): Router {
  const router = Router({ mergeParams: true });
  const requireAuth = createRequireAuth(services.orgService);
  const deps: FamilyShareControllerDeps = {
    caseService: services.caseService,
    orgService: services.orgService,
    familyLinkMailer: services.familyLinkMailer,
  };

  router.post("/share-email", requireAuth, (req: Request, res: Response) =>
    postFamilyShareEmail(req as AuthenticatedRequest, res, deps),
  );

  return router;
}
