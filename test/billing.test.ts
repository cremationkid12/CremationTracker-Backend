import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryOrgService } from "../src/services/orgService";
import { createMemoryCaseService } from "../src/services/caseService";

describe("per-case billing after free credits", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret-cremation-tracker";
    delete process.env.STRIPE_SECRET_KEY;
    process.env.ALLOW_MOCK_BILLING = "true";
    process.env.FREE_LIVE_CASES_PER_ORG = "3";
    process.env.CASE_PRICE_CENTS = "799";
  });

  function buildApp() {
    const orgService = createMemoryOrgService();
    return createApp({
      authService: createLocalAuthService(),
      orgService,
      caseService: createMemoryCaseService(orgService),
    });
  }

  async function registerFh(app: ReturnType<typeof buildApp>, email: string) {
    const reg = await request(app).post("/v1/auth/register").send({
      email,
      password: "password123",
      name: "Billing Admin",
      org_type: "funeral_home",
      org_name: "Billing FH",
    });
    assert.equal(reg.status, 201);
    return reg.body.access_token as string;
  }

  it("creates three free live cases then pending without QR/PIN", async () => {
    const app = buildApp();
    const token = await registerFh(app, "billing1@fh.example");

    for (let i = 0; i < 3; i++) {
      const live = await request(app)
        .post("/v1/cases")
        .set("Authorization", `Bearer ${token}`)
        .send({ case_mode: "live", decedent_display_name: `Free ${i}` });
      assert.equal(live.status, 201);
      assert.equal(live.body.billing_status, "free_credit");
      assert.ok(live.body.pin);
      assert.ok(live.body.qr_payload);
    }

    const pending = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ case_mode: "live", decedent_display_name: "Needs Pay" });
    assert.equal(pending.status, 201);
    assert.equal(pending.body.billing_status, "pending");
    assert.equal(pending.body.pin, null);
    assert.equal(pending.body.qr_payload, null);
    assert.equal(pending.body.family_token, null);

    const credits = await request(app)
      .get("/v1/billing/credits")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(credits.status, 200);
    assert.equal(credits.body.free_live_cases_remaining, 0);
    assert.equal(credits.body.live_cases_created, 4);
    assert.equal(credits.body.case_price_cents, 799);
  });

  it("mock checkout unlocks QR/PIN on pending case", async () => {
    const app = buildApp();
    const token = await registerFh(app, "billing2@fh.example");

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/v1/cases")
        .set("Authorization", `Bearer ${token}`)
        .send({ case_mode: "live", decedent_display_name: `Used ${i}` });
    }

    const pending = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ case_mode: "live", decedent_display_name: "Pay Me" });
    assert.equal(pending.body.billing_status, "pending");
    const caseId = pending.body.id as string;

    const checkout = await request(app)
      .post(`/v1/cases/${caseId}/billing/checkout`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.provider, "mock");
    assert.equal(checkout.body.case.billing_status, "paid");
    assert.ok(checkout.body.case.pin);
    assert.ok(checkout.body.case.qr_payload);

    const detail = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.billing_status, "paid");
    assert.ok(detail.body.pin);
  });
});
