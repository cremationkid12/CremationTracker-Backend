import express from "express";
import type { Express } from "express";
import { registerV1Routes } from "./routes";
import { setupSwaggerUi } from "./swaggerUi";

export function createApp(): Express {
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

  setupSwaggerUi(app);
  registerV1Routes(app);

  return app;
}
