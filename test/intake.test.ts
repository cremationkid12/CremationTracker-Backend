import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryCaseService } from "../src/services/caseService";
import { createMemoryOrgService } from "../src/services/orgService";

describe("FH intake fields", () => {
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

  it("stores allowed intake for funeral home and strips it from crematory", async () => {
    const app = buildApp();
    const fh = await request(app).post("/v1/auth/register").send({
      email: "intake-fh@example.com",
      password: "password123",
      name: "FH Admin",
      org_type: "funeral_home",
      org_name: "Harbor FH",
    });
    const crem = await request(app).post("/v1/auth/register").send({
      email: "intake-crem@example.com",
      password: "password123",
      name: "Crem Admin",
      org_type: "crematory",
      org_name: "Island Crematory",
    });

    const created = await request(app)
      .post("/v1/cases")
      .set("Authorization", `Bearer ${fh.body.access_token}`)
      .send({
        case_mode: "live",
        decedent_display_name: "Jordan Hale",
        intake: {
          person_name: "Jordan Hale",
          gender: "female",
          date_of_birth: "1948-03-12",
          next_of_kin_name: "Alex Hale",
          next_of_kin_phone: "555-0100",
          secret_field: "should-drop",
        },
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.intake.person_name, "Jordan Hale");
    assert.equal(created.body.intake.gender, "female");
    assert.equal(created.body.intake.next_of_kin_name, "Alex Hale");
    assert.equal(created.body.intake.secret_field, undefined);

    const fhGet = await request(app)
      .get(`/v1/cases/${created.body.id}`)
      .set("Authorization", `Bearer ${fh.body.access_token}`);
    assert.equal(fhGet.status, 200);
    assert.equal(fhGet.body.intake.next_of_kin_name, "Alex Hale");

    const pin = created.body.pin as string;
    const claim = await request(app)
      .post("/v1/cases/claim")
      .set("Authorization", `Bearer ${crem.body.access_token}`)
      .send({ pin });
    assert.equal(claim.status, 200);
    assert.deepEqual(claim.body.intake, {});
  });
});
