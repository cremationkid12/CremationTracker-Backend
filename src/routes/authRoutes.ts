import { Router } from "express";
import type { Request, Response } from "express";
import {
  createRequireAuth,
  createRequireAuthUser,
  type AuthenticatedRequest,
} from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import {
  getAuthMe,
  postLogin,
  postRefresh,
  postRegister,
  type AuthControllerDeps,
} from "../controllers/authController";
import { postAcceptInvite } from "../controllers/inviteController";

export function createAuthRouter(services: AppServices): Router {
  const router = Router();
  const requireAuth = createRequireAuth(services.orgService);
  const requireAuthUser = createRequireAuthUser(services.orgService);
  const authDeps: AuthControllerDeps = {
    authService: services.authService,
    orgService: services.orgService,
    inviteService: services.inviteService,
  };

  router.get("/me", requireAuth, (req: Request, res: Response) =>
    getAuthMe(req as AuthenticatedRequest, res),
  );
  router.post("/register", (req: Request, res: Response) => postRegister(req, res, authDeps));
  router.post("/login", (req: Request, res: Response) => postLogin(req, res, authDeps));
  router.post("/refresh", (req: Request, res: Response) =>
    postRefresh(req, res, services.authService),
  );
  router.post("/invites/accept", requireAuthUser, (req: Request, res: Response) =>
    postAcceptInvite(req as AuthenticatedRequest, res, services.inviteService),
  );

  return router;
}
