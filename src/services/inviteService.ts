import { randomUUID } from "node:crypto";
import { getPgPool, hasDatabase } from "../db/pool";
import { sha256Hex } from "./authService";
import type { createMemoryOrgService, OrgService } from "./orgService";
import type { MemberRole, OrgRoleForUser } from "../types/domain";

export class InviteError extends Error {
  constructor(
    message: string,
    readonly code: "bad_request" | "not_found" | "forbidden" | "conflict" = "bad_request",
  ) {
    super(message);
    this.name = "InviteError";
  }
}

export type InvitePreview = {
  org_id: string;
  org_name: string;
  org_type: string;
  invited_email: string;
  invited_role: MemberRole;
  expires_at: string;
};

export type CreateInviteInput = {
  orgId: string;
  invitedByUserId: string;
  email: string;
  role?: MemberRole;
};

export type CreateInviteResult = {
  status: "invited";
  email: string;
  org_id: string;
  invite_token: string;
  expires_at: string;
};

export type InviteService = {
  createInvite: (input: CreateInviteInput) => Promise<CreateInviteResult>;
  previewInvite: (rawToken: string) => Promise<InvitePreview>;
  acceptInvite: (input: {
    rawToken: string;
    userId: string;
    email: string;
    name: string;
  }) => Promise<OrgRoleForUser>;
};

type InviteRow = {
  id: string;
  org_id: string;
  invited_email: string;
  invited_role: MemberRole;
  token_hash: string;
  status: string;
  expires_at: string;
  invited_by_user_id: string;
};

type MemoryOrg = ReturnType<typeof createMemoryOrgService>;

function inviteTtlDays(): number {
  const raw = Number(process.env.INVITE_TOKEN_TTL_DAYS ?? 7);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

function generateRawToken(): string {
  return `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
}

function hashToken(raw: string): string {
  return sha256Hex(raw.trim());
}

export function createMemoryInviteService(
  orgService: MemoryOrg,
  invites = new Map<string, InviteRow>(),
): InviteService {
  return {
    async createInvite(input) {
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@")) throw new InviteError("Valid email is required.");
      const role: MemberRole = input.role === "admin" ? "admin" : "associate";
      const org = await orgService.getOrganization(input.orgId);
      if (!org) throw new InviteError("Organization not found.", "not_found");

      const rawToken = generateRawToken();
      const expires = new Date(Date.now() + inviteTtlDays() * 24 * 60 * 60 * 1000).toISOString();
      const row: InviteRow = {
        id: randomUUID(),
        org_id: input.orgId,
        invited_email: email,
        invited_role: role,
        token_hash: hashToken(rawToken),
        status: "pending",
        expires_at: expires,
        invited_by_user_id: input.invitedByUserId,
      };
      invites.set(row.id, row);
      return {
        status: "invited",
        email,
        org_id: input.orgId,
        invite_token: rawToken,
        expires_at: expires,
      };
    },

    async previewInvite(rawToken) {
      const hash = hashToken(rawToken);
      const row = [...invites.values()].find((i) => i.token_hash === hash);
      if (!row || row.status !== "pending") {
        throw new InviteError("Invite not found.", "not_found");
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        row.status = "expired";
        throw new InviteError("Invite has expired.", "not_found");
      }
      const org = await orgService.getOrganization(row.org_id);
      if (!org) throw new InviteError("Organization not found.", "not_found");
      return {
        org_id: row.org_id,
        org_name: org.name,
        org_type: org.org_type,
        invited_email: row.invited_email,
        invited_role: row.invited_role,
        expires_at: row.expires_at,
      };
    },

    async acceptInvite(input) {
      const hash = hashToken(input.rawToken);
      const row = [...invites.values()].find((i) => i.token_hash === hash);
      if (!row || row.status !== "pending") {
        throw new InviteError("Invite not found.", "not_found");
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        row.status = "expired";
        throw new InviteError("Invite has expired.", "not_found");
      }
      if (row.invited_email !== input.email.trim().toLowerCase()) {
        throw new InviteError("Invite email does not match signed-in user.", "forbidden");
      }

      const membership = await orgService.attachMember({
        userId: input.userId,
        orgId: row.org_id,
        email: input.email,
        name: input.name,
        role: row.invited_role,
      });
      row.status = "accepted";
      return membership;
    },
  };
}

function createPgInviteService(orgService: OrgService): InviteService {
  return {
    async createInvite(input) {
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@")) throw new InviteError("Valid email is required.");
      const role: MemberRole = input.role === "admin" ? "admin" : "associate";
      const org = await orgService.getOrganization(input.orgId);
      if (!org) throw new InviteError("Organization not found.", "not_found");

      const pool = getPgPool();
      const rawToken = generateRawToken();
      const expires = new Date(Date.now() + inviteTtlDays() * 24 * 60 * 60 * 1000);
      const id = randomUUID();
      await pool.query(
        `INSERT INTO org_invites (
           id, org_id, invited_email, invited_role, token_hash, status, expires_at, invited_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
        [id, input.orgId, email, role, hashToken(rawToken), expires.toISOString(), input.invitedByUserId],
      );
      return {
        status: "invited",
        email,
        org_id: input.orgId,
        invite_token: rawToken,
        expires_at: expires.toISOString(),
      };
    },

    async previewInvite(rawToken) {
      const pool = getPgPool();
      const result = await pool.query<{
        org_id: string;
        invited_email: string;
        invited_role: MemberRole;
        expires_at: string;
        status: string;
        org_name: string;
        org_type: string;
      }>(
        `SELECT i.org_id, i.invited_email, i.invited_role, i.expires_at::text, i.status,
                o.name AS org_name, o.org_type
         FROM org_invites i
         JOIN organizations o ON o.id = i.org_id
         WHERE i.token_hash = $1
         LIMIT 1`,
        [hashToken(rawToken)],
      );
      const row = result.rows[0];
      if (!row || row.status !== "pending") {
        throw new InviteError("Invite not found.", "not_found");
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await pool.query(`UPDATE org_invites SET status = 'expired', updated_at = NOW() WHERE token_hash = $1`, [
          hashToken(rawToken),
        ]);
        throw new InviteError("Invite has expired.", "not_found");
      }
      return {
        org_id: row.org_id,
        org_name: row.org_name,
        org_type: row.org_type,
        invited_email: row.invited_email,
        invited_role: row.invited_role,
        expires_at: row.expires_at,
      };
    },

    async acceptInvite(input) {
      const pool = getPgPool();
      const hash = hashToken(input.rawToken);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<{
          id: string;
          org_id: string;
          invited_email: string;
          invited_role: MemberRole;
          expires_at: string;
          status: string;
        }>(
          `SELECT id, org_id, invited_email, invited_role, expires_at::text, status
           FROM org_invites WHERE token_hash = $1 FOR UPDATE`,
          [hash],
        );
        const row = found.rows[0];
        if (!row || row.status !== "pending") {
          throw new InviteError("Invite not found.", "not_found");
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
          await client.query(`UPDATE org_invites SET status = 'expired', updated_at = NOW() WHERE id = $1`, [
            row.id,
          ]);
          throw new InviteError("Invite has expired.", "not_found");
        }
        if (row.invited_email !== input.email.trim().toLowerCase()) {
          throw new InviteError("Invite email does not match signed-in user.", "forbidden");
        }

        const membership = await orgService.attachMember({
          userId: input.userId,
          orgId: row.org_id,
          email: input.email,
          name: input.name,
          role: row.invited_role,
        });

        await client.query(
          `UPDATE org_invites
           SET status = 'accepted', accepted_by_user_id = $2, accepted_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id, input.userId],
        );
        await client.query("COMMIT");
        return membership;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createDefaultInviteService(orgService: OrgService): InviteService {
  if (hasDatabase()) return createPgInviteService(orgService);
  return createMemoryInviteService(orgService as MemoryOrg);
}
