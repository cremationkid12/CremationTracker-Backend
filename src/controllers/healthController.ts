import type { Request, Response } from "express";

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    service: "cremation-tracker-api",
    version: "0.1.0",
  });
}
