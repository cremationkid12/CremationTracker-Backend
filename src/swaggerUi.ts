import fs from "fs";
import path from "path";
import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

function resolveOpenApiPath(): string {
  const candidates = [
    path.join(process.cwd(), "openapi.yaml"),
    path.join(__dirname, "..", "openapi.yaml"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  throw new Error(
    `openapi.yaml not found (tried: ${candidates.join(", ")}). Run the server from the package root.`,
  );
}

function loadOpenApiDocument(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = parseYaml(raw) as Record<string, unknown>;
  const base =
    typeof process.env.SWAGGER_SERVER_URL === "string" && process.env.SWAGGER_SERVER_URL.trim()
      ? process.env.SWAGGER_SERVER_URL.trim()
      : "/";
  doc.servers = [{ url: base, description: "This server (Try it out)" }];
  return doc;
}

export function setupSwaggerUi(app: Express): void {
  if (process.env.ENABLE_SWAGGER_UI?.trim().toLowerCase() === "false") {
    return;
  }
  try {
    const openApiPath = path.resolve(resolveOpenApiPath());
    const spec = loadOpenApiDocument(openApiPath);
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(spec, { customSiteTitle: "Cremation Tracker API docs" }),
    );
    app.get("/openapi.yaml", (_req, res) => {
      res.type("application/yaml").sendFile(openApiPath);
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[Swagger UI disabled] ${reason}`);
  }
}
