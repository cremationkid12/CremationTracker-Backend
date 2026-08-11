import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { getPgPool, hasDatabase } from "../db/pool";
import { sha256Hex } from "./authService";
import type { createMemoryOrgService } from "./orgService";

export type CaseMode = "test" | "live";
export type CaseStatus = "active" | "completed" | "archived";

export type CaseStep = {
  id: string;
  case_id: string;
  step_code: string;
  step_label: string;
  actor_org_id: string;
  actor_user_id: string | null;
  note: string | null;
  recorded_at: string;
};

export type CaseRecord = {
  id: string;
  owner_org_id: string;
  custody_org_id: string | null;
  case_mode: CaseMode;
  status: CaseStatus;
  decedent_display_name: string;
  intake: Record<string, unknown>;
  billing_status: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  /** Hashed secrets — never expose */
  qr_token_hash: string | null;
  pin_hash: string | null;
};

export type CaseDetail = {
  id: string;
  owner_org_id: string;
  custody_org_id: string | null;
  case_mode: CaseMode;
  status: CaseStatus;
  decedent_display_name: string;
  intake: Record<string, unknown>;
  billing_status: string | null;
  created_at: string;
  current_step_label: string | null;
  steps: CaseStep[];
  /** Returned only on live create to funeral home */
  qr_payload?: string | null;
  pin?: string | null;
};

export type CaseSummary = {
  id: string;
  case_mode: CaseMode;
  status: CaseStatus;
  decedent_display_name: string;
  current_step_label: string | null;
  created_at: string;
};

export type CreateCaseInput = {
  ownerOrgId: string;
  createdByUserId: string;
  caseMode: CaseMode;
  decedentDisplayName: string;
  intake?: Record<string, unknown>;
};

export type CaseService = {
  createCase: (input: CreateCaseInput) => Promise<CaseDetail>;
  listCases: (
    orgId: string,
    opts?: { status?: CaseStatus; caseMode?: CaseMode },
  ) => Promise<{ cases: CaseSummary[]; active_count: number }>;
  getCase: (orgId: string, caseId: string) => Promise<CaseDetail | null>;
};

type MemoryOrgService = ReturnType<typeof createMemoryOrgService>;

const INITIAL_STEP = {
  code: "received_into_care",
  label: "Received into care of funeral home",
};

function generatePin(): string {
  return String(randomInt(100000, 999999));
}

function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createMemoryCaseService(orgService: MemoryOrgService): CaseService {
  const cases = new Map<string, CaseRecord>();
  const steps = new Map<string, CaseStep[]>();

  return {
    async createCase(input) {
      const org = await orgService.getOrganization(input.ownerOrgId);
      if (!org || org.org_type !== "funeral_home") {
        throw new Error("Only funeral homes can create cases.");
      }

      let billingStatus: string | null = "not_required";
      let qrPayload: string | null = null;
      let pin: string | null = null;
      let qrHash: string | null = null;
      let pinHash: string | null = null;

      if (input.caseMode === "live") {
        const credits = orgService._state.credits.get(input.ownerOrgId) ?? {
          free_live_cases_remaining: 3,
          live_cases_created: 0,
        };
        if (credits.free_live_cases_remaining > 0) {
          credits.free_live_cases_remaining -= 1;
          billingStatus = "free_credit";
        } else {
          // Phase 4 wires Stripe; for Phase 1 still allow creation and mark pending payment path later.
          billingStatus = "pending";
        }
        credits.live_cases_created += 1;
        orgService._state.credits.set(input.ownerOrgId, credits);

        qrPayload = generateQrToken();
        pin = generatePin();
        qrHash = sha256Hex(qrPayload);
        pinHash = sha256Hex(pin);
      }

      const now = new Date().toISOString();
      const id = randomUUID();
      const record: CaseRecord = {
        id,
        owner_org_id: input.ownerOrgId,
        custody_org_id: input.ownerOrgId,
        case_mode: input.caseMode,
        status: "active",
        decedent_display_name: input.decedentDisplayName.trim(),
        intake: input.intake ?? {},
        billing_status: billingStatus,
        created_by_user_id: input.createdByUserId,
        created_at: now,
        updated_at: now,
        qr_token_hash: qrHash,
        pin_hash: pinHash,
      };
      cases.set(id, record);

      const step: CaseStep = {
        id: randomUUID(),
        case_id: id,
        step_code: INITIAL_STEP.code,
        step_label: INITIAL_STEP.label,
        actor_org_id: input.ownerOrgId,
        actor_user_id: input.createdByUserId,
        note: null,
        recorded_at: now,
      };
      steps.set(id, [step]);

      return {
        id: record.id,
        owner_org_id: record.owner_org_id,
        custody_org_id: record.custody_org_id,
        case_mode: record.case_mode,
        status: record.status,
        decedent_display_name: record.decedent_display_name,
        intake: record.intake,
        billing_status: record.billing_status,
        created_at: record.created_at,
        current_step_label: step.step_label,
        steps: [step],
        qr_payload: qrPayload,
        pin,
      };
    },

    async listCases(orgId, opts) {
      const all = [...cases.values()].filter((c) => c.owner_org_id === orgId);
      const active_count = all.filter((c) => c.status === "active").length;
      let filtered = all;
      if (opts?.status) filtered = filtered.filter((c) => c.status === opts.status);
      if (opts?.caseMode) filtered = filtered.filter((c) => c.case_mode === opts.caseMode);
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));

      const summaries: CaseSummary[] = filtered.map((c) => {
        const caseSteps = steps.get(c.id) ?? [];
        const last = caseSteps[caseSteps.length - 1];
        return {
          id: c.id,
          case_mode: c.case_mode,
          status: c.status,
          decedent_display_name: c.decedent_display_name,
          current_step_label: last?.step_label ?? null,
          created_at: c.created_at,
        };
      });
      return { cases: summaries, active_count };
    },

    async getCase(orgId, caseId) {
      const record = cases.get(caseId);
      if (!record) return null;
      if (record.owner_org_id !== orgId && record.custody_org_id !== orgId) return null;
      const caseSteps = steps.get(caseId) ?? [];
      const last = caseSteps[caseSteps.length - 1];
      const isOwner = record.owner_org_id === orgId;
      return {
        id: record.id,
        owner_org_id: record.owner_org_id,
        custody_org_id: record.custody_org_id,
        case_mode: record.case_mode,
        status: record.status,
        decedent_display_name: record.decedent_display_name,
        intake: isOwner ? record.intake : {},
        billing_status: isOwner ? record.billing_status : null,
        created_at: record.created_at,
        current_step_label: last?.step_label ?? null,
        steps: caseSteps,
      };
    },
  };
}

function createPgCaseService(): CaseService {
  return {
    async createCase(input) {
      const pool = getPgPool();
      const orgResult = await pool.query<{ org_type: string }>(
        `SELECT org_type FROM organizations WHERE id = $1`,
        [input.ownerOrgId],
      );
      if (!orgResult.rows[0] || orgResult.rows[0].org_type !== "funeral_home") {
        throw new Error("Only funeral homes can create cases.");
      }

      let billingStatus: string | null = "not_required";
      let qrPayload: string | null = null;
      let pin: string | null = null;
      let qrHash: string | null = null;
      let pinHash: string | null = null;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        if (input.caseMode === "live") {
          const creditResult = await client.query<{
            free_live_cases_remaining: number;
            live_cases_created: number;
          }>(
            `SELECT free_live_cases_remaining, live_cases_created
             FROM org_case_credits WHERE org_id = $1 FOR UPDATE`,
            [input.ownerOrgId],
          );
          let free = creditResult.rows[0]?.free_live_cases_remaining ?? 3;
          let created = creditResult.rows[0]?.live_cases_created ?? 0;
          if (!creditResult.rows[0]) {
            await client.query(
              `INSERT INTO org_case_credits (org_id, free_live_cases_remaining, live_cases_created)
               VALUES ($1, 3, 0)`,
              [input.ownerOrgId],
            );
            free = 3;
            created = 0;
          }
          if (free > 0) {
            free -= 1;
            billingStatus = "free_credit";
          } else {
            billingStatus = "pending";
          }
          created += 1;
          await client.query(
            `UPDATE org_case_credits
             SET free_live_cases_remaining = $2, live_cases_created = $3, updated_at = NOW()
             WHERE org_id = $1`,
            [input.ownerOrgId, free, created],
          );

          qrPayload = generateQrToken();
          pin = generatePin();
          qrHash = sha256Hex(qrPayload);
          pinHash = sha256Hex(pin);
        }

        const id = randomUUID();
        const insert = await client.query<{
          id: string;
          owner_org_id: string;
          custody_org_id: string | null;
          case_mode: CaseMode;
          status: CaseStatus;
          decedent_display_name: string;
          intake: Record<string, unknown>;
          billing_status: string | null;
          created_at: string;
        }>(
          `INSERT INTO cases (
             id, owner_org_id, custody_org_id, case_mode, status,
             decedent_display_name, intake, qr_token_hash, pin_hash,
             billing_status, created_by_user_id
           ) VALUES ($1,$2,$2,$3,'active',$4,$5::jsonb,$6,$7,$8,$9)
           RETURNING id, owner_org_id, custody_org_id, case_mode, status,
                     decedent_display_name, intake, billing_status, created_at::text`,
          [
            id,
            input.ownerOrgId,
            input.caseMode,
            input.decedentDisplayName.trim(),
            JSON.stringify(input.intake ?? {}),
            qrHash,
            pinHash,
            billingStatus,
            input.createdByUserId,
          ],
        );

        const stepId = randomUUID();
        const stepResult = await client.query<CaseStep>(
          `INSERT INTO case_steps (
             id, case_id, step_code, step_label, actor_org_id, actor_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, case_id, step_code, step_label, actor_org_id, actor_user_id, note,
                     recorded_at::text`,
          [
            stepId,
            id,
            INITIAL_STEP.code,
            INITIAL_STEP.label,
            input.ownerOrgId,
            input.createdByUserId,
          ],
        );

        await client.query("COMMIT");
        const row = insert.rows[0];
        const step = stepResult.rows[0];
        return {
          id: row.id,
          owner_org_id: row.owner_org_id,
          custody_org_id: row.custody_org_id,
          case_mode: row.case_mode,
          status: row.status,
          decedent_display_name: row.decedent_display_name,
          intake: row.intake,
          billing_status: row.billing_status,
          created_at: row.created_at,
          current_step_label: step.step_label,
          steps: [step],
          qr_payload: qrPayload,
          pin,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listCases(orgId, opts) {
      const pool = getPgPool();
      const params: unknown[] = [orgId];
      const filters = ["owner_org_id = $1"];
      if (opts?.status) {
        params.push(opts.status);
        filters.push(`status = $${params.length}`);
      }
      if (opts?.caseMode) {
        params.push(opts.caseMode);
        filters.push(`case_mode = $${params.length}`);
      }

      const list = await pool.query<{
        id: string;
        case_mode: CaseMode;
        status: CaseStatus;
        decedent_display_name: string;
        created_at: string;
        current_step_label: string | null;
      }>(
        `SELECT c.id, c.case_mode, c.status, c.decedent_display_name, c.created_at::text,
                (
                  SELECT s.step_label FROM case_steps s
                  WHERE s.case_id = c.id
                  ORDER BY s.recorded_at DESC LIMIT 1
                ) AS current_step_label
         FROM cases c
         WHERE ${filters.join(" AND ")}
         ORDER BY c.created_at DESC`,
        params,
      );

      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM cases
         WHERE owner_org_id = $1 AND status = 'active'`,
        [orgId],
      );

      return {
        cases: list.rows.map((row) => ({
          id: row.id,
          case_mode: row.case_mode,
          status: row.status,
          decedent_display_name: row.decedent_display_name,
          current_step_label: row.current_step_label,
          created_at: row.created_at,
        })),
        active_count: Number(countResult.rows[0]?.count ?? 0),
      };
    },

    async getCase(orgId, caseId) {
      const pool = getPgPool();
      const caseResult = await pool.query<{
        id: string;
        owner_org_id: string;
        custody_org_id: string | null;
        case_mode: CaseMode;
        status: CaseStatus;
        decedent_display_name: string;
        intake: Record<string, unknown>;
        billing_status: string | null;
        created_at: string;
      }>(
        `SELECT id, owner_org_id, custody_org_id, case_mode, status,
                decedent_display_name, intake, billing_status, created_at::text
         FROM cases
         WHERE id = $1 AND (owner_org_id = $2 OR custody_org_id = $2)`,
        [caseId, orgId],
      );
      const record = caseResult.rows[0];
      if (!record) return null;

      const stepResult = await pool.query<CaseStep>(
        `SELECT id, case_id, step_code, step_label, actor_org_id, actor_user_id, note,
                recorded_at::text
         FROM case_steps WHERE case_id = $1 ORDER BY recorded_at ASC`,
        [caseId],
      );
      const caseSteps = stepResult.rows;
      const last = caseSteps[caseSteps.length - 1];
      const isOwner = record.owner_org_id === orgId;
      return {
        id: record.id,
        owner_org_id: record.owner_org_id,
        custody_org_id: record.custody_org_id,
        case_mode: record.case_mode,
        status: record.status,
        decedent_display_name: record.decedent_display_name,
        intake: isOwner ? record.intake : {},
        billing_status: isOwner ? record.billing_status : null,
        created_at: record.created_at,
        current_step_label: last?.step_label ?? null,
        steps: caseSteps,
      };
    },
  };
}

export function createDefaultCaseService(orgService?: MemoryOrgService): CaseService {
  if (hasDatabase()) return createPgCaseService();
  if (!orgService) {
    throw new Error("Memory case service requires a memory org service instance.");
  }
  return createMemoryCaseService(orgService);
}
