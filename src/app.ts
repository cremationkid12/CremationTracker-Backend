import express from "express";
import type { Express } from "express";
import type { AppServices } from "./appServices";
import { registerV1Routes } from "./routes";
import { createDefaultAuthService, type AuthService } from "./services/authService";
import {
  createDefaultCaseService,
  createMemoryCaseService,
  type CaseService,
} from "./services/caseService";
import {
  createDefaultOrgService,
  createMemoryOrgService,
  type OrgService,
} from "./services/orgService";
import { setupSwaggerUi } from "./swaggerUi";
import { hasDatabase } from "./db/pool";

export type AppDependencies = {
  authService?: AuthService;
  orgService?: OrgService;
  caseService?: CaseService;
};

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();

  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  const orgService = deps.orgService ?? createDefaultOrgService();
  const caseService =
    deps.caseService ??
    (hasDatabase()
      ? createDefaultCaseService()
      : createMemoryCaseService(orgService as ReturnType<typeof createMemoryOrgService>));
  const services: AppServices = {
    authService: deps.authService ?? createDefaultAuthService(),
    orgService,
    caseService,
  };

  setupSwaggerUi(app);
  registerV1Routes(app, services);

  return app;
}
