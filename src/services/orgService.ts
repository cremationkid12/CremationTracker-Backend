import { randomUUID } from "node:crypto";
import { getPgPool, hasDatabase } from "../db/pool";
import type {
  BootstrapOrgInput,
  MemberRole,
  Organization,
  OrgMember,
  OrgRoleForUser,
  OrgType,
} from "../types/domain";

export type OrgService = {
  findOrgRoleByUserId: (userId: string) => Promise<OrgRoleForUser | null>;
  getOrganization: (orgId: string) => Promise<Organization | null>;
  bootstrapOrgAndAdmin: (input: BootstrapOrgInput) => Promise<OrgRoleForUser>;
};

type MemoryState = {
  orgs: Map<string, Organization>;
  members: Map<string, OrgMember>; // key: user_id
  credits: Map<string, { free_live_cases_remaining: number; live_cases_created: number }>;
};

function createMemoryState(): MemoryState {
  return { orgs: new Map(), members: new Map(), credits: new Map() };
}

export function createMemoryOrgService(state: MemoryState = createMemoryState()): OrgService & {
  _state: MemoryState;
} {
  return {
    _state: state,
    async findOrgRoleByUserId(userId) {
      const member = state.members.get(userId);
      if (!member || !member.active) return null;
      const org = state.orgs.get(member.org_id);
      if (!org) return null;
      return {
        org_id: member.org_id,
        org_type: org.org_type,
        role: member.role,
        email: member.email,
        name: member.name,
      };
    },
    async getOrganization(orgId) {
      return state.orgs.get(orgId) ?? null;
    },
    async bootstrapOrgAndAdmin(input) {
      const existing = await this.findOrgRoleByUserId(input.userId);
      if (existing) return existing;

      const orgId = randomUUID();
      const now = new Date().toISOString();
      const org: Organization = {
        id: orgId,
        org_type: input.orgType,
        name: input.orgName.trim(),
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        created_at: now,
      };
      const member: OrgMember = {
        id: input.userId,
        org_id: orgId,
        user_id: input.userId,
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        role: "admin",
        active: true,
      };
      state.orgs.set(orgId, org);
      state.members.set(input.userId, member);
      if (input.orgType === "funeral_home") {
        state.credits.set(orgId, { free_live_cases_remaining: 3, live_cases_created: 0 });
      }
      return {
        org_id: orgId,
        org_type: org.org_type,
        role: "admin",
        email: member.email,
        name: member.name,
      };
    },
  };
}

function createPgOrgService(): OrgService {
  return {
    async findOrgRoleByUserId(userId) {
      const pool = getPgPool();
      const result = await pool.query<{
        org_id: string;
        org_type: OrgType;
        role: MemberRole;
        email: string;
        name: string;
      }>(
        `SELECT m.org_id, o.org_type, m.role, m.email, m.name
         FROM org_members m
         JOIN organizations o ON o.id = m.org_id
         WHERE m.user_id = $1 AND m.active = true
         LIMIT 1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async getOrganization(orgId) {
      const pool = getPgPool();
      const result = await pool.query<Organization>(
        `SELECT id, org_type, name, phone, address, created_at::text
         FROM organizations WHERE id = $1`,
        [orgId],
      );
      return result.rows[0] ?? null;
    },
    async bootstrapOrgAndAdmin(input) {
      const existing = await this.findOrgRoleByUserId(input.userId);
      if (existing) return existing;

      const pool = getPgPool();
      const orgId = randomUUID();
      const email = input.email.trim().toLowerCase();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO organizations (id, org_type, name, phone, address)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            orgId,
            input.orgType,
            input.orgName.trim(),
            input.phone?.trim() || null,
            input.address?.trim() || null,
          ],
        );
        await client.query(
          `INSERT INTO org_members (id, org_id, user_id, email, name, role, active)
           VALUES ($1, $2, $3, $4, $5, 'admin', true)`,
          [input.userId, orgId, input.userId, email, input.name.trim()],
        );
        if (input.orgType === "funeral_home") {
          await client.query(
            `INSERT INTO org_case_credits (org_id, free_live_cases_remaining, live_cases_created)
             VALUES ($1, 3, 0)`,
            [orgId],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return {
        org_id: orgId,
        org_type: input.orgType,
        role: "admin",
        email,
        name: input.name.trim(),
      };
    },
  };
}

export function createDefaultOrgService(): OrgService {
  if (hasDatabase()) return createPgOrgService();
  return createMemoryOrgService();
}
