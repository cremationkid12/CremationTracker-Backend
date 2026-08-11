import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryCaseService } from "../src/services/caseService";
import { createMemoryOrgService } from "../src/services/orgService";

describe("steps + crematory claim", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret-cremation-tracker";
  });

  function buildApp() {
    const orgService = createMemoryOrgService();
    return {
      app: createApp({
        authService: createLocalAuthService(),
        orgService,
        caseService: createMemoryCaseService(orgService),
      }),
    };
  }

  it("advances funeral home steps then crematory claims by PIN", async () => {
    const { app } = buildApp();

    const fh = await request(app).post("/v1/auth/register").send({
      email: "fh@example.com",
      password: "password123",
      name: "FH Admin",
      org_type: "funeral_home",
      org_name: "Harbor FH",
    });
    const fhToken = fh.body.access_token as string;

    const crematory = await request(app).post("/v1/auth/register").send({
      email: "crem@example.com",
      password: "password123",
      name: "Crem Admin",
      org_type: "crematory",
      org_name: "Island Crematory",
    });
    const cremToken = crematory.body.access_token as string;

    const created = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${fhToken}`)
      .send({ case_mode: "live", decedent_display_name: "Jordan Hale" });
    assert.equal(created.status, 201);
    const caseId = created.body.id as string;
    const pin = created.body.pin as string;
    assert.ok(pin);

    const step1 = await request(app)
      .post(`/v1/cases/${caseId}/steps`)
      .set("Authorization", `Bearer ${fhToken}`)
      .send({ step_code: "dressed_per_wishes" });
    assert.equal(step1.status, 201);
    assert.equal(step1.body.current_step_code, "dressed_per_wishes");
    assert.ok(step1.body.available_next_steps.length >= 1);

    const claim = await request(app)
      .post("/v1/cases/claim")
      .set("Authorization", `Bearer ${cremToken}`)
      .send({ pin });
    assert.equal(claim.status, 200);
    assert.equal(claim.body.current_step_code, "custody_accepted");
    assert.equal(claim.body.intake && Object.keys(claim.body.intake).length, 0);
    assert.equal(claim.body.billing_status, null);

    const cremList = await request(app)
      .get("/v1/cases?status=active")
      .set("Authorization", `Bearer ${cremToken}`);
    assert.equal(cremList.status, 200);
    assert.equal(cremList.body.active_count, 1);

    const cremStep = await request(app)
      .post(`/v1/cases/${caseId}/steps`)
      .set("Authorization", `Bearer ${cremToken}`)
      .send({ step_code: "in_holding" });
    assert.equal(cremStep.status, 201);
    assert.equal(cremStep.body.current_step_code, "in_holding");

    const fhBlocked = await request(app)
      .post(`/v1/cases/${caseId}/steps`)
      .set("Authorization", `Bearer ${fhToken}`)
      .send({ step_code: "cremation_in_progress" });
    assert.equal(fhBlocked.status, 403);
  });

  it("rejects claim with invalid pin", async () => {
    const { app } = buildApp();
    const crematory = await request(app).post("/v1/auth/register").send({
      email: "crem2@example.com",
      password: "password123",
      name: "Crem Admin",
      org_type: "crematory",
      org_name: "Bay Crematory",
    });
    const res = await request(app)
      .post("/v1/cases/claim")
      .set("Authorization", `Bearer ${crematory.body.access_token}`)
      .send({ pin: "000000" });
    assert.equal(res.status, 404);
  });
});
