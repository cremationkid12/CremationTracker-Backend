import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

export async function loadMigrationFiles(
  migrationsDir: string = path.resolve(process.cwd(), "db", "migrations"),
): Promise<string[]> {
  const files = await fs.readdir(migrationsDir);
  return files.filter((file) => file.endsWith(".sql")).sort();
}

export async function runMigrations(client: Client, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? path.resolve(process.cwd(), "db", "migrations");
  const files = await loadMigrationFiles(dir);

  for (const file of files) {
    const absoluteFile = path.resolve(dir, file);
    const sql = await fs.readFile(absoluteFile, "utf8");
    await client.query(sql);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await runMigrations(client);
    console.log("Migrations completed successfully.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
