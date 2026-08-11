import type { Express } from "express";
import type { AppServices } from "../appServices";
import { createAuthRouter } from "./authRoutes";
import { createCaseRouter } from "./caseRoutes";
import { createHealthRouter } from "./healthRoutes";
import { createPublicRouter } from "./publicRoutes";

export function registerV1Routes(app: Express, services: AppServices): void {
  app.use("/v1", createHealthRouter());
  app.use("/v1/auth", createAuthRouter(services));
  app.use("/v1/cases", createCaseRouter(services));
  app.use("/v1/public", createPublicRouter(services));
}
