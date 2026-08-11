import { Router } from "express";
import type { Request, Response } from "express";
import { createRequireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import {
  createCase,
  getCase,
  listCases,
  type CaseControllerDeps,
} from "../controllers/caseController";

export function createCaseRouter(services: AppServices): Router {
  const router = Router();
  const requireAuth = createRequireAuth(services.orgService);
  const deps: CaseControllerDeps = { caseService: services.caseService };

  router.get("/", requireAuth, (req: Request, res: Response) =>
    listCases(req as AuthenticatedRequest, res, deps),
  );
  router.post("/", requireAuth, (req: Request, res: Response) =>
    createCase(req as AuthenticatedRequest, res, deps),
  );
  router.get("/:caseId", requireAuth, (req: Request, res: Response) =>
    getCase(req as AuthenticatedRequest, res, deps),
  );

  return router;
}
