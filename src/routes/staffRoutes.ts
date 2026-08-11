import { Router } from "express";
import type { Request, Response } from "express";
import { createRequireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import { postStaffInvite, type StaffInviteControllerDeps } from "../controllers/inviteController";

export function createStaffRouter(services: AppServices): Router {
  const router = Router();
  const requireAuth = createRequireAuth(services.orgService);
  const deps: StaffInviteControllerDeps = {
    inviteService: services.inviteService,
    inviteMailer: services.inviteMailer,
  };

  router.post("/invite", requireAuth, (req: Request, res: Response) =>
    postStaffInvite(req as AuthenticatedRequest, res, deps),
  );

  return router;
}
