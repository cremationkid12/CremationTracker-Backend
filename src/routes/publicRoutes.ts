import { Router } from "express";
import type { Request, Response } from "express";
import type { AppServices } from "../appServices";
import {
  getFamilyByPin,
  getFamilyByToken,
  type PublicControllerDeps,
} from "../controllers/publicController";

export function createPublicRouter(services: AppServices): Router {
  const router = Router();
  const deps: PublicControllerDeps = { caseService: services.caseService };

  router.get("/family", (req: Request, res: Response) => getFamilyByPin(req, res, deps));
  router.get("/family/:token", (req: Request, res: Response) => getFamilyByToken(req, res, deps));

  return router;
}
