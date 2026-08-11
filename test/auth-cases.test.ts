import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryOrgService } from "../src/services/orgService";
import { createMemoryCaseService } from "../src/services/caseService";

describe("auth + cases Phase 1", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret-cremation-tracker";
  });

  function buildApp() {
    const orgService = createMemoryOrgService();
    return createApp({
      authService: createLocalAuthService(),
      orgService,
      caseService: createMemoryCaseService(orgService),
    });
  }

  it("registers funeral home admin and returns session", async () => {
    const app = buildApp();
    const res = await request(app).post("/v1/auth/register").send({
      email: "admin@fh.example",
      password: "password123",
      name: "Alex Admin",
      org_type: "funeral_home",
      org_name: "Harbor Funeral Home",
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.access_token);
    assert.equal(res.body.user.org_type, "funeral_home");
    assert.equal(res.body.user.role, "admin");
  });

  it("creates test case without qr/pin and live case with secrets", async () => {
    const app = buildApp();
    const reg = await request(app).post("/v1/auth/register").send({
      email: "director@fh.example",
      password: "password123",
      name: "Dana Director",
      org_type: "funeral_home",
      org_name: "Lakeside FH",
    });
    const token = reg.body.access_token as string;

    const testCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        case_mode: "test",
        decedent_display_name: "Training Doe",
      });
    assert.equal(testCase.status, 201);
    assert.equal(testCase.body.case_mode, "test");
    assert.equal(testCase.body.pin, null);
    assert.equal(testCase.body.qr_payload, null);
    assert.equal(testCase.body.billing_status, "not_required");

    const liveCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        case_mode: "live",
        decedent_display_name: "Jordan Hale",
      });
    assert.equal(liveCase.status, 201);
    assert.equal(liveCase.body.case_mode, "live");
    assert.ok(liveCase.body.pin);
    assert.ok(liveCase.body.qr_payload);
    assert.equal(liveCase.body.billing_status, "free_credit");

    const list = await request(app)
      .get("/v1/cases?status=active")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.active_count, 2);
    assert.equal(list.body.cases.length, 2);

    const me = await request(app).get("/v1/auth/me").set("Authorization", `Bearer ${token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.org_type, "funeral_home");
  });

  it("blocks crematory from creating cases", async () => {
    const app = buildApp();
    const reg = await request(app).post("/v1/auth/register").send({
      email: "ops@crematory.example",
      password: "password123",
      name: "Casey Crematory",
      org_type: "crematory",
      org_name: "Island Crematory",
    });
    const token = reg.body.access_token as string;
    const res = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ case_mode: "live", decedent_display_name: "Should Fail" });
    assert.equal(res.status, 403);
  });
});
