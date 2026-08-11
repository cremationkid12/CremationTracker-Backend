import { Router } from "express";
import { getHealth } from "../controllers/healthController";

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", getHealth);
  return router;
}
