import { Pool } from "pg";

let pgPool: Pool | null = null;

export function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  pgPool = new Pool({ connectionString });
  return pgPool;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Test helper — reset singleton between suites if needed. */
export function resetPgPoolForTests(): void {
  pgPool = null;
}
