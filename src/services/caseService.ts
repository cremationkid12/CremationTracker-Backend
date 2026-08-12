import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { casePriceCents, freeLiveCasesPerOrg } from "../config/billing";
import { buildFamilyStatusUrl } from "../config/familyPortal";
import { getPgPool, hasDatabase } from "../db/pool";
import type { OrgType } from "../types/domain";
import { sha256Hex } from "./authService";
import type { createMemoryOrgService } from "./orgService";
import {
  getStepDef,
  INITIAL_STEP,
  listAvailableNextSteps,
  type StepDef,
} from "./stepCatalog";
import { buildFamilyStatus, type FamilyStatusResponse } from "./familyStatus";

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
  billing_provider?: string | null;
  billing_transaction_id?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
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
  current_step_code: string | null;
  steps: CaseStep[];
  available_next_steps: Array<{ code: string; label: string }>;
  /** Owner funeral home only */
  qr_payload?: string | null;
  pin?: string | null;
  family_token?: string | null;
  /** Absolute family portal URL when secrets exist */
  family_url?: string | null;
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

export type RecordStepInput = {
  orgId: string;
  orgType: OrgType;
  userId: string;
  caseId: string;
  stepCode: string;
  note?: string;
};

export type ClaimCaseInput = {
  crematoryOrgId: string;
  userId: string;
  qrToken?: string;
  pin?: string;
};

export type ActivatePaidCaseInput = {
  caseId: string;
  provider: "stripe" | "mock";
  transactionId: string;
};

export type OrgCredits = {
  free_live_cases_remaining: number;
  live_cases_created: number;
  case_price_cents: number;
};

export class CaseServiceError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "not_found" | "bad_request" | "conflict" = "bad_request",
  ) {
    super(message);
    this.name = "CaseServiceError";
  }
}

export type CaseService = {
  createCase: (input: CreateCaseInput) => Promise<CaseDetail>;
  listCases: (
    orgId: string,
    orgType: OrgType,
    opts?: { status?: CaseStatus; caseMode?: CaseMode },
  ) => Promise<{ cases: CaseSummary[]; active_count: number }>;
  getCase: (orgId: string, orgType: OrgType, caseId: string) => Promise<CaseDetail | null>;
  recordStep: (input: RecordStepInput) => Promise<CaseDetail>;
  claimCase: (input: ClaimCaseInput) => Promise<CaseDetail>;
  getOrgCredits: (orgId: string) => Promise<OrgCredits>;
  /** Issue QR/PIN after payment for a pending/failed live case. Idempotent on same transaction. */
  activatePaidCase: (input: ActivatePaidCaseInput) => Promise<CaseDetail>;
  getFamilyStatusByPin: (pin: string) => Promise<import("./familyStatus").FamilyStatusResponse>;
  getFamilyStatusByToken: (
    token: string,
  ) => Promise<import("./familyStatus").FamilyStatusResponse>;
};

type MemoryOrgService = ReturnType<typeof createMemoryOrgService>;

function generatePin(): string {
  return String(randomInt(100000, 999999));
}

function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

function toAvailable(steps: StepDef[]): Array<{ code: string; label: string }> {
  return steps.map((s) => ({ code: s.code, label: s.label }));
}

function buildDetail(args: {
  record: CaseRecord;
  caseSteps: CaseStep[];
  viewerOrgId: string;
  viewerOrgType: OrgType;
  extras?: { qr_payload?: string | null; pin?: string | null; family_token?: string | null };
}): CaseDetail {
  const { record, caseSteps, viewerOrgId, viewerOrgType, extras } = args;
  const last = caseSteps[caseSteps.length - 1];
  const isOwner = record.owner_org_id === viewerOrgId;
  const custodyIsViewer = record.custody_org_id === viewerOrgId;

  let resolvedCustodyType: OrgType = "funeral_home";
  if (record.custody_org_id && record.custody_org_id !== record.owner_org_id) {
    resolvedCustodyType = "crematory";
  }
  if (custodyIsViewer) resolvedCustodyType = viewerOrgType;

  const available = listAvailableNextSteps(
    last?.step_code ?? null,
    viewerOrgType,
    resolvedCustodyType,
  );

  const familyToken = isOwner ? (extras?.family_token ?? null) : null;
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
    current_step_code: last?.step_code ?? null,
    steps: caseSteps,
    available_next_steps: record.status === "active" ? toAvailable(available) : [],
    qr_payload: isOwner ? (extras?.qr_payload ?? null) : null,
    pin: isOwner ? (extras?.pin ?? null) : null,
    family_token: familyToken,
    family_url: familyToken ? buildFamilyStatusUrl(familyToken) : null,
  };
}

export function createMemoryCaseService(orgService: MemoryOrgService): CaseService {
  const cases = new Map<string, CaseRecord>();
  const steps = new Map<string, CaseStep[]>();
  const secrets = new Map<
    string,
    { pin: string; qr_token: string; family_token: string }
  >();

  async function detailFor(orgId: string, orgType: OrgType, caseId: string): Promise<CaseDetail | null> {
    const record = cases.get(caseId);
    if (!record) return null;
    if (record.owner_org_id !== orgId && record.custody_org_id !== orgId) return null;
    const secret = secrets.get(caseId);
    return buildDetail({
      record,
      caseSteps: steps.get(caseId) ?? [],
      viewerOrgId: orgId,
      viewerOrgType: orgType,
      extras: secret
        ? { pin: secret.pin, qr_payload: secret.qr_token, family_token: secret.family_token }
        : undefined,
    });
  }

  async function familyStatusForCase(caseId: string): Promise<FamilyStatusResponse> {
    const record = cases.get(caseId);
    if (!record) throw new CaseServiceError("Case not found.", "not_found");
    const org = await orgService.getOrganization(record.owner_org_id);
    return buildFamilyStatus({
      decedentDisplayName: record.decedent_display_name,
      funeralHomeName: org?.name ?? "Funeral home",
      status: record.status,
      steps: steps.get(caseId) ?? [],
    });
  }

  return {
    async createCase(input) {
      const org = await orgService.getOrganization(input.ownerOrgId);
      if (!org || org.org_type !== "funeral_home") {
        throw new CaseServiceError("Only funeral homes can create cases.", "forbidden");
      }

      let billingStatus: string | null = "not_required";
      let qrPayload: string | null = null;
      let pin: string | null = null;
      let qrHash: string | null = null;
      let pinHash: string | null = null;

      if (input.caseMode === "live") {
        const freeDefault = freeLiveCasesPerOrg();
        const credits = orgService._state.credits.get(input.ownerOrgId) ?? {
          free_live_cases_remaining: freeDefault,
          live_cases_created: 0,
        };
        if (credits.free_live_cases_remaining > 0) {
          credits.free_live_cases_remaining -= 1;
          billingStatus = "free_credit";
          qrPayload = generateQrToken();
          pin = generatePin();
          qrHash = sha256Hex(qrPayload);
          pinHash = sha256Hex(pin);
        } else {
          billingStatus = "pending";
        }
        credits.live_cases_created += 1;
        orgService._state.credits.set(input.ownerOrgId, credits);
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

      let familyToken: string | null = null;
      if (input.caseMode === "live" && pin && qrPayload) {
        familyToken = randomBytes(24).toString("base64url");
        secrets.set(id, { pin, qr_token: qrPayload, family_token: familyToken });
      }

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

      return buildDetail({
        record,
        caseSteps: [step],
        viewerOrgId: input.ownerOrgId,
        viewerOrgType: "funeral_home",
        extras: { qr_payload: qrPayload, pin, family_token: familyToken },
      });
    },

    async listCases(orgId, orgType, opts) {
      const all = [...cases.values()].filter((c) =>
        orgType === "funeral_home"
          ? c.owner_org_id === orgId
          : c.custody_org_id === orgId && c.custody_org_id !== c.owner_org_id,
      );
      const active_count = all.filter((c) => c.status === "active").length;
      let filtered = all;
      if (opts?.status) filtered = filtered.filter((c) => c.status === opts.status);
      if (opts?.caseMode) filtered = filtered.filter((c) => c.case_mode === opts.caseMode);
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));

      return {
        active_count,
        cases: filtered.map((c) => {
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
        }),
      };
    },

    async getCase(orgId, orgType, caseId) {
      return detailFor(orgId, orgType, caseId);
    },

    async recordStep(input) {
      const record = cases.get(input.caseId);
      if (!record) throw new CaseServiceError("Case not found.", "not_found");
      if (record.owner_org_id !== input.orgId && record.custody_org_id !== input.orgId) {
        throw new CaseServiceError("Case not found.", "not_found");
      }
      if (record.status !== "active") {
        throw new CaseServiceError("Case is not active.", "conflict");
      }
      if (record.custody_org_id !== input.orgId) {
        throw new CaseServiceError("Only the org with custody can record steps.", "forbidden");
      }

      const def = getStepDef(input.stepCode);
      if (!def) throw new CaseServiceError("Unknown step_code.", "bad_request");

      const caseSteps = steps.get(input.caseId) ?? [];
      const last = caseSteps[caseSteps.length - 1];
      const custodyType: OrgType =
        record.custody_org_id === record.owner_org_id ? "funeral_home" : "crematory";
      const available = listAvailableNextSteps(last?.step_code ?? null, input.orgType, custodyType);
      if (!available.some((s) => s.code === input.stepCode)) {
        throw new CaseServiceError(
          `Step "${input.stepCode}" is not available from current step.`,
          "bad_request",
        );
      }

      const now = new Date().toISOString();
      const step: CaseStep = {
        id: randomUUID(),
        case_id: input.caseId,
        step_code: def.code,
        step_label: def.label,
        actor_org_id: input.orgId,
        actor_user_id: input.userId,
        note: input.note?.trim() || null,
        recorded_at: now,
      };
      caseSteps.push(step);
      steps.set(input.caseId, caseSteps);
      record.updated_at = now;

      if (def.completesCase) {
        record.status = "archived";
        record.updated_at = now;
      }

      return buildDetail({
        record,
        caseSteps,
        viewerOrgId: input.orgId,
        viewerOrgType: input.orgType,
      });
    },

    async claimCase(input) {
      const qrHash = input.qrToken ? sha256Hex(input.qrToken.trim()) : null;
      const pinHash = input.pin ? sha256Hex(input.pin.trim()) : null;
      if (!qrHash && !pinHash) {
        throw new CaseServiceError("qr_token or pin is required.", "bad_request");
      }

      const record = [...cases.values()].find((c) => {
        if (c.case_mode !== "live" || c.status !== "active") return false;
        if (qrHash && c.qr_token_hash === qrHash) return true;
        if (pinHash && c.pin_hash === pinHash) return true;
        return false;
      });
      if (!record) throw new CaseServiceError("No matching live case found.", "not_found");

      if (record.custody_org_id !== record.owner_org_id) {
        if (record.custody_org_id === input.crematoryOrgId) {
          return detailFor(input.crematoryOrgId, "crematory", record.id) as Promise<CaseDetail>;
        }
        throw new CaseServiceError("Case already claimed by another crematory.", "conflict");
      }

      const now = new Date().toISOString();
      record.custody_org_id = input.crematoryOrgId;
      record.updated_at = now;

      const caseSteps = steps.get(record.id) ?? [];
      const last = caseSteps[caseSteps.length - 1];

      // Auto-fill drop-off if FH had not recorded it yet.
      if (last?.step_code === "transported_to_crematory") {
        caseSteps.push({
          id: randomUUID(),
          case_id: record.id,
          step_code: "dropped_off_at_crematory",
          step_label: getStepDef("dropped_off_at_crematory")!.label,
          actor_org_id: record.owner_org_id,
          actor_user_id: null,
          note: "Auto-recorded on crematory claim",
          recorded_at: now,
        });
      } else if (
        last &&
        last.step_code !== "dropped_off_at_crematory" &&
        last.step_code !== "custody_accepted"
      ) {
        // Allow claim once transport has started or later FH steps; still accept from earlier for pilot.
        // Soft path: append drop-off then custody.
        if (getStepDef(last.step_code)) {
          caseSteps.push({
            id: randomUUID(),
            case_id: record.id,
            step_code: "dropped_off_at_crematory",
            step_label: getStepDef("dropped_off_at_crematory")!.label,
            actor_org_id: record.owner_org_id,
            actor_user_id: null,
            note: "Auto-recorded on crematory claim",
            recorded_at: now,
          });
        }
      }

      if (caseSteps[caseSteps.length - 1]?.step_code !== "custody_accepted") {
        caseSteps.push({
          id: randomUUID(),
          case_id: record.id,
          step_code: "custody_accepted",
          step_label: getStepDef("custody_accepted")!.label,
          actor_org_id: input.crematoryOrgId,
          actor_user_id: input.userId,
          note: null,
          recorded_at: now,
        });
      }
      steps.set(record.id, caseSteps);

      return buildDetail({
        record,
        caseSteps,
        viewerOrgId: input.crematoryOrgId,
        viewerOrgType: "crematory",
      });
    },

    async getOrgCredits(orgId) {
      const freeDefault = freeLiveCasesPerOrg();
      const credits = orgService._state.credits.get(orgId) ?? {
        free_live_cases_remaining: freeDefault,
        live_cases_created: 0,
      };
      return {
        free_live_cases_remaining: credits.free_live_cases_remaining,
        live_cases_created: credits.live_cases_created,
        case_price_cents: casePriceCents(),
      };
    },

    async activatePaidCase(input) {
      const record = cases.get(input.caseId);
      if (!record) throw new CaseServiceError("Case not found.", "not_found");
      if (record.case_mode !== "live") {
        throw new CaseServiceError("Only live cases require payment.", "bad_request");
      }
      if (record.billing_status === "paid" || record.billing_status === "free_credit") {
        if (
          record.billing_status === "paid" &&
          record.billing_transaction_id &&
          record.billing_transaction_id !== input.transactionId
        ) {
          throw new CaseServiceError("Case already paid with a different transaction.", "conflict");
        }
        const secret = secrets.get(record.id);
        return buildDetail({
          record,
          caseSteps: steps.get(record.id) ?? [],
          viewerOrgId: record.owner_org_id,
          viewerOrgType: "funeral_home",
          extras: secret
            ? { pin: secret.pin, qr_payload: secret.qr_token, family_token: secret.family_token }
            : undefined,
        });
      }
      if (record.billing_status !== "pending" && record.billing_status !== "failed") {
        throw new CaseServiceError("Case is not awaiting payment.", "conflict");
      }

      const qrPayload = generateQrToken();
      const pin = generatePin();
      const familyToken = randomBytes(24).toString("base64url");
      const now = new Date().toISOString();
      record.qr_token_hash = sha256Hex(qrPayload);
      record.pin_hash = sha256Hex(pin);
      record.billing_status = "paid";
      record.billing_provider = input.provider;
      record.billing_transaction_id = input.transactionId;
      record.updated_at = now;
      secrets.set(record.id, { pin, qr_token: qrPayload, family_token: familyToken });

      return buildDetail({
        record,
        caseSteps: steps.get(record.id) ?? [],
        viewerOrgId: record.owner_org_id,
        viewerOrgType: "funeral_home",
        extras: { pin, qr_payload: qrPayload, family_token: familyToken },
      });
    },

    async getFamilyStatusByPin(pin) {
      const normalized = pin.trim();
      for (const [caseId, secret] of secrets.entries()) {
        if (secret.pin === normalized) {
          return familyStatusForCase(caseId);
        }
      }
      throw new CaseServiceError("No case found for that PIN.", "not_found");
    },

    async getFamilyStatusByToken(token) {
      const normalized = token.trim();
      for (const [caseId, secret] of secrets.entries()) {
        if (secret.family_token === normalized) {
          return familyStatusForCase(caseId);
        }
      }
      throw new CaseServiceError("No case found for that link.", "not_found");
    },
  };
}

function createPgCaseService(): CaseService {
  async function loadSteps(caseId: string): Promise<CaseStep[]> {
    const pool = getPgPool();
    const stepResult = await pool.query<CaseStep>(
      `SELECT id, case_id, step_code, step_label, actor_org_id, actor_user_id, note,
              recorded_at::text
       FROM case_steps WHERE case_id = $1 ORDER BY recorded_at ASC`,
      [caseId],
    );
    return stepResult.rows;
  }

  async function loadRecord(caseId: string): Promise<CaseRecord | null> {
    const pool = getPgPool();
    const result = await pool.query<CaseRecord>(
      `SELECT id, owner_org_id, custody_org_id, case_mode, status, decedent_display_name,
              intake, billing_status, created_by_user_id, created_at::text, updated_at::text,
              qr_token_hash, pin_hash
       FROM cases WHERE id = $1`,
      [caseId],
    );
    return result.rows[0] ?? null;
  }

  return {
    async createCase(input) {
      const pool = getPgPool();
      const orgResult = await pool.query<{ org_type: string }>(
        `SELECT org_type FROM organizations WHERE id = $1`,
        [input.ownerOrgId],
      );
      if (!orgResult.rows[0] || orgResult.rows[0].org_type !== "funeral_home") {
        throw new CaseServiceError("Only funeral homes can create cases.", "forbidden");
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
          let free = creditResult.rows[0]?.free_live_cases_remaining ?? freeLiveCasesPerOrg();
          let created = creditResult.rows[0]?.live_cases_created ?? 0;
          if (!creditResult.rows[0]) {
            await client.query(
              `INSERT INTO org_case_credits (org_id, free_live_cases_remaining, live_cases_created)
               VALUES ($1, $2, 0)`,
              [input.ownerOrgId, freeLiveCasesPerOrg()],
            );
            free = freeLiveCasesPerOrg();
            created = 0;
          }
          if (free > 0) {
            free -= 1;
            billingStatus = "free_credit";
            qrPayload = generateQrToken();
            pin = generatePin();
            qrHash = sha256Hex(qrPayload);
            pinHash = sha256Hex(pin);
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
        }

        const id = randomUUID();
        const familyToken =
          input.caseMode === "live" && pin && qrPayload
            ? randomBytes(24).toString("base64url")
            : null;
        const insert = await client.query<CaseRecord>(
          `INSERT INTO cases (
             id, owner_org_id, custody_org_id, case_mode, status,
             decedent_display_name, intake, qr_token_hash, pin_hash,
             billing_status, created_by_user_id
           ) VALUES ($1,$2,$2,$3,'active',$4,$5::jsonb,$6,$7,$8,$9)
           RETURNING id, owner_org_id, custody_org_id, case_mode, status,
                     decedent_display_name, intake, billing_status, created_by_user_id,
                     created_at::text, updated_at::text, qr_token_hash, pin_hash`,
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

        if (familyToken && pin && qrPayload) {
          await client.query(
            `INSERT INTO case_share_secrets (case_id, pin, qr_token, family_token)
             VALUES ($1, $2, $3, $4)`,
            [id, pin, qrPayload, familyToken],
          );
          await client.query(
            `INSERT INTO family_access (id, case_id, access_token_hash)
             VALUES ($1, $2, $3)`,
            [randomUUID(), id, sha256Hex(familyToken)],
          );
        }

        const stepId = randomUUID();
        await client.query(
          `INSERT INTO case_steps (
             id, case_id, step_code, step_label, actor_org_id, actor_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
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
        const record = insert.rows[0];
        const caseSteps = await loadSteps(id);
        return buildDetail({
          record,
          caseSteps,
          viewerOrgId: input.ownerOrgId,
          viewerOrgType: "funeral_home",
          extras: { qr_payload: qrPayload, pin, family_token: familyToken },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listCases(orgId, orgType, opts) {
      const pool = getPgPool();
      const params: unknown[] = [orgId];
      const filters: string[] =
        orgType === "funeral_home"
          ? ["owner_org_id = $1"]
          : ["custody_org_id = $1", "custody_org_id IS DISTINCT FROM owner_org_id"];
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

      const countSql =
        orgType === "funeral_home"
          ? `SELECT COUNT(*)::text AS count FROM cases WHERE owner_org_id = $1 AND status = 'active'`
          : `SELECT COUNT(*)::text AS count FROM cases
             WHERE custody_org_id = $1 AND custody_org_id IS DISTINCT FROM owner_org_id
               AND status = 'active'`;
      const countResult = await pool.query<{ count: string }>(countSql, [orgId]);

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

    async getCase(orgId, orgType, caseId) {
      const record = await loadRecord(caseId);
      if (!record) return null;
      if (record.owner_org_id !== orgId && record.custody_org_id !== orgId) return null;
      const caseSteps = await loadSteps(caseId);
      let extras: { pin?: string; qr_payload?: string; family_token?: string } | undefined;
      if (record.owner_org_id === orgId) {
        const pool = getPgPool();
        const secret = await pool.query<{ pin: string; qr_token: string; family_token: string }>(
          `SELECT pin, qr_token, family_token FROM case_share_secrets WHERE case_id = $1`,
          [caseId],
        );
        if (secret.rows[0]) {
          extras = {
            pin: secret.rows[0].pin,
            qr_payload: secret.rows[0].qr_token,
            family_token: secret.rows[0].family_token,
          };
        }
      }
      return buildDetail({
        record,
        caseSteps,
        viewerOrgId: orgId,
        viewerOrgType: orgType,
        extras,
      });
    },

    async recordStep(input) {
      const pool = getPgPool();
      const record = await loadRecord(input.caseId);
      if (!record || (record.owner_org_id !== input.orgId && record.custody_org_id !== input.orgId)) {
        throw new CaseServiceError("Case not found.", "not_found");
      }
      if (record.status !== "active") {
        throw new CaseServiceError("Case is not active.", "conflict");
      }
      if (record.custody_org_id !== input.orgId) {
        throw new CaseServiceError("Only the org with custody can record steps.", "forbidden");
      }

      const def = getStepDef(input.stepCode);
      if (!def) throw new CaseServiceError("Unknown step_code.", "bad_request");

      const caseSteps = await loadSteps(input.caseId);
      const last = caseSteps[caseSteps.length - 1];
      const custodyType: OrgType =
        record.custody_org_id === record.owner_org_id ? "funeral_home" : "crematory";
      const available = listAvailableNextSteps(last?.step_code ?? null, input.orgType, custodyType);
      if (!available.some((s) => s.code === input.stepCode)) {
        throw new CaseServiceError(
          `Step "${input.stepCode}" is not available from current step.`,
          "bad_request",
        );
      }

      const stepId = randomUUID();
      await pool.query(
        `INSERT INTO case_steps (
           id, case_id, step_code, step_label, actor_org_id, actor_user_id, note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          stepId,
          input.caseId,
          def.code,
          def.label,
          input.orgId,
          input.userId,
          input.note?.trim() || null,
        ],
      );

      if (def.completesCase) {
        await pool.query(
          `UPDATE cases SET status = 'archived', completed_at = NOW(), archived_at = NOW(),
           updated_at = NOW() WHERE id = $1`,
          [input.caseId],
        );
      } else {
        await pool.query(`UPDATE cases SET updated_at = NOW() WHERE id = $1`, [input.caseId]);
      }

      const updated = await loadRecord(input.caseId);
      const updatedSteps = await loadSteps(input.caseId);
      return buildDetail({
        record: updated!,
        caseSteps: updatedSteps,
        viewerOrgId: input.orgId,
        viewerOrgType: input.orgType,
      });
    },

    async claimCase(input) {
      const pool = getPgPool();
      const qrHash = input.qrToken ? sha256Hex(input.qrToken.trim()) : null;
      const pinHash = input.pin ? sha256Hex(input.pin.trim()) : null;
      if (!qrHash && !pinHash) {
        throw new CaseServiceError("qr_token or pin is required.", "bad_request");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<CaseRecord>(
          `SELECT id, owner_org_id, custody_org_id, case_mode, status, decedent_display_name,
                  intake, billing_status, created_by_user_id, created_at::text, updated_at::text,
                  qr_token_hash, pin_hash
           FROM cases
           WHERE case_mode = 'live' AND status = 'active'
             AND (
               ($1::text IS NOT NULL AND qr_token_hash = $1)
               OR ($2::text IS NOT NULL AND pin_hash = $2)
             )
           FOR UPDATE`,
          [qrHash, pinHash],
        );
        const record = found.rows[0];
        if (!record) {
          throw new CaseServiceError("No matching live case found.", "not_found");
        }

        if (record.custody_org_id !== record.owner_org_id) {
          if (record.custody_org_id === input.crematoryOrgId) {
            await client.query("COMMIT");
            const caseSteps = await loadSteps(record.id);
            return buildDetail({
              record,
              caseSteps,
              viewerOrgId: input.crematoryOrgId,
              viewerOrgType: "crematory",
            });
          }
          throw new CaseServiceError("Case already claimed by another crematory.", "conflict");
        }

        await client.query(
          `UPDATE cases SET custody_org_id = $2, updated_at = NOW() WHERE id = $1`,
          [record.id, input.crematoryOrgId],
        );

        const existing = await client.query<{ step_code: string }>(
          `SELECT step_code FROM case_steps WHERE case_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
          [record.id],
        );
        const lastCode = existing.rows[0]?.step_code;

        if (lastCode !== "dropped_off_at_crematory" && lastCode !== "custody_accepted") {
          await client.query(
            `INSERT INTO case_steps (
               id, case_id, step_code, step_label, actor_org_id, actor_user_id, note
             ) VALUES ($1,$2,$3,$4,$5,NULL,$6)`,
            [
              randomUUID(),
              record.id,
              "dropped_off_at_crematory",
              getStepDef("dropped_off_at_crematory")!.label,
              record.owner_org_id,
              "Auto-recorded on crematory claim",
            ],
          );
        }

        const afterDrop = await client.query<{ step_code: string }>(
          `SELECT step_code FROM case_steps WHERE case_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
          [record.id],
        );
        if (afterDrop.rows[0]?.step_code !== "custody_accepted") {
          await client.query(
            `INSERT INTO case_steps (
               id, case_id, step_code, step_label, actor_org_id, actor_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              randomUUID(),
              record.id,
              "custody_accepted",
              getStepDef("custody_accepted")!.label,
              input.crematoryOrgId,
              input.userId,
            ],
          );
        }

        await client.query("COMMIT");
        const updated = await loadRecord(record.id);
        const caseSteps = await loadSteps(record.id);
        return buildDetail({
          record: updated!,
          caseSteps,
          viewerOrgId: input.crematoryOrgId,
          viewerOrgType: "crematory",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getOrgCredits(orgId) {
      const pool = getPgPool();
      const result = await pool.query<{
        free_live_cases_remaining: number;
        live_cases_created: number;
      }>(
        `SELECT free_live_cases_remaining, live_cases_created
         FROM org_case_credits WHERE org_id = $1`,
        [orgId],
      );
      return {
        free_live_cases_remaining:
          result.rows[0]?.free_live_cases_remaining ?? freeLiveCasesPerOrg(),
        live_cases_created: result.rows[0]?.live_cases_created ?? 0,
        case_price_cents: casePriceCents(),
      };
    },

    async activatePaidCase(input) {
      const pool = getPgPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<
          CaseRecord & {
            billing_provider: string | null;
            billing_transaction_id: string | null;
          }
        >(
          `SELECT id, owner_org_id, custody_org_id, case_mode, status, decedent_display_name,
                  intake, billing_status, billing_provider, billing_transaction_id,
                  created_by_user_id, created_at::text, updated_at::text,
                  qr_token_hash, pin_hash
           FROM cases WHERE id = $1 FOR UPDATE`,
          [input.caseId],
        );
        const record = found.rows[0];
        if (!record) throw new CaseServiceError("Case not found.", "not_found");
        if (record.case_mode !== "live") {
          throw new CaseServiceError("Only live cases require payment.", "bad_request");
        }

        if (record.billing_status === "paid" || record.billing_status === "free_credit") {
          if (
            record.billing_status === "paid" &&
            record.billing_transaction_id &&
            record.billing_transaction_id !== input.transactionId
          ) {
            throw new CaseServiceError(
              "Case already paid with a different transaction.",
              "conflict",
            );
          }
          await client.query("COMMIT");
          const caseSteps = await loadSteps(record.id);
          const secret = await pool.query<{
            pin: string;
            qr_token: string;
            family_token: string;
          }>(`SELECT pin, qr_token, family_token FROM case_share_secrets WHERE case_id = $1`, [
            record.id,
          ]);
          return buildDetail({
            record,
            caseSteps,
            viewerOrgId: record.owner_org_id,
            viewerOrgType: "funeral_home",
            extras: secret.rows[0]
              ? {
                  pin: secret.rows[0].pin,
                  qr_payload: secret.rows[0].qr_token,
                  family_token: secret.rows[0].family_token,
                }
              : undefined,
          });
        }

        if (record.billing_status !== "pending" && record.billing_status !== "failed") {
          throw new CaseServiceError("Case is not awaiting payment.", "conflict");
        }

        const qrPayload = generateQrToken();
        const pin = generatePin();
        const familyToken = randomBytes(24).toString("base64url");

        await client.query(
          `UPDATE cases
           SET qr_token_hash = $2, pin_hash = $3,
               billing_status = 'paid', billing_provider = $4, billing_transaction_id = $5,
               updated_at = NOW()
           WHERE id = $1`,
          [
            record.id,
            sha256Hex(qrPayload),
            sha256Hex(pin),
            input.provider,
            input.transactionId,
          ],
        );
        await client.query(
          `INSERT INTO case_share_secrets (case_id, pin, qr_token, family_token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (case_id) DO UPDATE
             SET pin = EXCLUDED.pin, qr_token = EXCLUDED.qr_token,
                 family_token = EXCLUDED.family_token`,
          [record.id, pin, qrPayload, familyToken],
        );
        await client.query(
          `INSERT INTO family_access (id, case_id, access_token_hash)
           VALUES ($1, $2, $3)`,
          [randomUUID(), record.id, sha256Hex(familyToken)],
        );

        await client.query("COMMIT");
        const updated = await loadRecord(record.id);
        const caseSteps = await loadSteps(record.id);
        return buildDetail({
          record: updated!,
          caseSteps,
          viewerOrgId: record.owner_org_id,
          viewerOrgType: "funeral_home",
          extras: { pin, qr_payload: qrPayload, family_token: familyToken },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getFamilyStatusByPin(pin) {
      const pool = getPgPool();
      const found = await pool.query<{
        case_id: string;
        decedent_display_name: string;
        status: string;
        funeral_home_name: string;
      }>(
        `SELECT s.case_id, c.decedent_display_name, c.status, o.name AS funeral_home_name
         FROM case_share_secrets s
         JOIN cases c ON c.id = s.case_id
         JOIN organizations o ON o.id = c.owner_org_id
         WHERE s.pin = $1
         LIMIT 1`,
        [pin.trim()],
      );
      const row = found.rows[0];
      if (!row) throw new CaseServiceError("No case found for that PIN.", "not_found");
      const caseSteps = await loadSteps(row.case_id);
      return buildFamilyStatus({
        decedentDisplayName: row.decedent_display_name,
        funeralHomeName: row.funeral_home_name,
        status: row.status,
        steps: caseSteps,
      });
    },

    async getFamilyStatusByToken(token) {
      const pool = getPgPool();
      const found = await pool.query<{
        case_id: string;
        decedent_display_name: string;
        status: string;
        funeral_home_name: string;
      }>(
        `SELECT s.case_id, c.decedent_display_name, c.status, o.name AS funeral_home_name
         FROM case_share_secrets s
         JOIN cases c ON c.id = s.case_id
         JOIN organizations o ON o.id = c.owner_org_id
         WHERE s.family_token = $1
         LIMIT 1`,
        [token.trim()],
      );
      const row = found.rows[0];
      if (!row) throw new CaseServiceError("No case found for that link.", "not_found");
      await pool.query(
        `UPDATE family_access SET last_accessed_at = NOW()
         WHERE case_id = $1 AND revoked_at IS NULL`,
        [row.case_id],
      );
      const caseSteps = await loadSteps(row.case_id);
      return buildFamilyStatus({
        decedentDisplayName: row.decedent_display_name,
        funeralHomeName: row.funeral_home_name,
        status: row.status,
        steps: caseSteps,
      });
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
