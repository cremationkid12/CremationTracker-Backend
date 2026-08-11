import express from "express";
import type { Express, Request, Response } from "express";
import type { AppServices } from "./appServices";
import { registerV1Routes } from "./routes";
import { createDefaultAuthService, type AuthService } from "./services/authService";
import { createBillingService, type BillingService } from "./services/billingService";
import {
  createDefaultCaseService,
  createMemoryCaseService,
  type CaseService,
} from "./services/caseService";
import { createDefaultInviteMailer, type InviteMailer } from "./services/inviteMailer";
import {
  createDefaultInviteService,
  createMemoryInviteService,
  type InviteService,
} from "./services/inviteService";
import {
  createDefaultOrgService,
  createMemoryOrgService,
  type OrgService,
} from "./services/orgService";
import { setupSwaggerUi } from "./swaggerUi";
import { hasDatabase } from "./db/pool";
import { stripeWebhook } from "./controllers/billingController";

export type AppDependencies = {
  authService?: AuthService;
  orgService?: OrgService;
  caseService?: CaseService;
  inviteService?: InviteService;
  inviteMailer?: InviteMailer;
  billingService?: BillingService;
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

  const orgService = deps.orgService ?? createDefaultOrgService();
  const inviteService =
    deps.inviteService ??
    (hasDatabase()
      ? createDefaultInviteService(orgService)
      : createMemoryInviteService(orgService as ReturnType<typeof createMemoryOrgService>));
  const caseService =
    deps.caseService ??
    (hasDatabase()
      ? createDefaultCaseService()
      : createMemoryCaseService(orgService as ReturnType<typeof createMemoryOrgService>));
  const billingService = deps.billingService ?? createBillingService(caseService);
  const services: AppServices = {
    authService: deps.authService ?? createDefaultAuthService(),
    orgService,
    caseService,
    inviteService,
    inviteMailer: deps.inviteMailer ?? createDefaultInviteMailer(),
    billingService,
  };

  // Stripe webhooks need the raw body — mount before express.json().
  app.post(
    "/v1/billing/webhook",
    express.raw({ type: "application/json" }),
    (req: Request, res: Response) =>
      stripeWebhook(req as never, res, { billingService: services.billingService }),
  );

  app.use(express.json({ limit: "1mb" }));

  setupSwaggerUi(app);
  registerV1Routes(app, services);

  return app;
}
