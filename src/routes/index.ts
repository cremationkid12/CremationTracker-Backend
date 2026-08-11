import type { Express } from "express";
import { createHealthRouter } from "./healthRoutes";

export function registerV1Routes(app: Express): void {
  app.use("/v1", createHealthRouter());
}
