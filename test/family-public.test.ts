import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryCaseService } from "../src/services/caseService";
import { createMemoryOrgService } from "../src/services/orgService";

describe("PIN re-view + family public status", () => {
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

  it("returns pin/qr/family_token to funeral home on getCase", async () => {
    const app = buildApp();
    const reg = await request(app).post("/v1/auth/register").send({
      email: "fh@secrets.example",
      password: "password123",
      name: "FH Admin",
      org_type: "funeral_home",
      org_name: "Harbor FH",
    });
    const token = reg.body.access_token as string;
    const created = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ case_mode: "live", decedent_display_name: "Jordan Hale" });
    assert.ok(created.body.pin);
    assert.ok(created.body.family_token);

    const detail = await request(app)
      .get(`/v1/cases/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.pin, created.body.pin);
    assert.equal(detail.body.qr_payload, created.body.qr_payload);
    assert.equal(detail.body.family_token, created.body.family_token);
    assert.ok(created.body.family_url);
    assert.ok(String(created.body.family_url).includes(`/f/${created.body.family_token}`));
    assert.equal(detail.body.family_url, created.body.family_url);

    const share = await request(app)
      .post(`/v1/cases/${created.body.id}/family/share-email`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "family@example.com" });
    assert.equal(share.status, 202);
    assert.equal(share.body.email, "family@example.com");
    assert.equal(share.body.family_url, created.body.family_url);
    assert.equal(share.body.delivered, false);

    const byPin = await request(app).get(`/v1/public/family?pin=${created.body.pin}`);
    assert.equal(byPin.status, 200);
    assert.equal(byPin.body.decedent_display_name, "Jordan Hale");
    assert.equal(byPin.body.funeral_home_name, "Harbor FH");
    assert.ok(Array.isArray(byPin.body.steps));
    assert.equal(byPin.body.steps[0].label.includes("Received"), true);

    const byToken = await request(app).get(
      `/v1/public/family/${created.body.family_token}`,
    );
    assert.equal(byToken.status, 200);
    assert.equal(byToken.body.decedent_display_name, "Jordan Hale");
  });
});
