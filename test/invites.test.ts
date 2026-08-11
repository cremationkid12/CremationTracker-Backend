import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryCaseService } from "../src/services/caseService";
import { createMemoryInviteService } from "../src/services/inviteService";
import { createMemoryOrgService } from "../src/services/orgService";

describe("staff invites", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret-cremation-tracker";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.DATABASE_URL;
  });

  function buildApp() {
    const orgService = createMemoryOrgService();
    const inviteService = createMemoryInviteService(orgService);
    return createApp({
      authService: createLocalAuthService(),
      orgService,
      caseService: createMemoryCaseService(orgService),
      inviteService,
      inviteMailer: { sendInvite: async () => undefined },
    });
  }

  it("admin invites associate who joins via register + invite_token", async () => {
    const app = buildApp();
    const admin = await request(app).post("/v1/auth/register").send({
      email: "admin@fh.example",
      password: "password123",
      name: "Admin User",
      org_type: "funeral_home",
      org_name: "Harbor FH",
    });
    assert.equal(admin.status, 201);

    const invite = await request(app)
      .post("/v1/staff/invite")
      .set("Authorization", `Bearer ${admin.body.access_token}`)
      .send({ email: "assoc@fh.example" });
    assert.equal(invite.status, 202);
    assert.ok(invite.body.invite_token);

    const preview = await request(app).get(
      `/v1/public/invites/${invite.body.invite_token}/preview`,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.invited_email, "assoc@fh.example");
    assert.equal(preview.body.org_name, "Harbor FH");

    const associate = await request(app).post("/v1/auth/register").send({
      email: "assoc@fh.example",
      password: "password123",
      name: "Associate User",
      invite_token: invite.body.invite_token,
    });
    assert.equal(associate.status, 201);
    assert.equal(associate.body.user.org_id, admin.body.user.org_id);
    assert.equal(associate.body.user.role, "associate");

    const me = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${associate.body.access_token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "associate");
  });

  it("blocks associate from inviting", async () => {
    const app = buildApp();
    const admin = await request(app).post("/v1/auth/register").send({
      email: "admin2@fh.example",
      password: "password123",
      name: "Admin",
      org_type: "funeral_home",
      org_name: "Bay FH",
    });
    const invite = await request(app)
      .post("/v1/staff/invite")
      .set("Authorization", `Bearer ${admin.body.access_token}`)
      .send({ email: "a2@fh.example" });
    const associate = await request(app).post("/v1/auth/register").send({
      email: "a2@fh.example",
      password: "password123",
      name: "Assoc",
      invite_token: invite.body.invite_token,
    });
    const blocked = await request(app)
      .post("/v1/staff/invite")
      .set("Authorization", `Bearer ${associate.body.access_token}`)
      .send({ email: "other@fh.example" });
    assert.equal(blocked.status, 403);
  });
});
