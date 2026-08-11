import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { createLocalAuthService } from "../src/services/authService";
import { createMemoryCaseService } from "../src/services/caseService";
import { createMemoryOrgService } from "../src/services/orgService";

describe("Supabase config guard", () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
    db: process.env.DATABASE_URL,
    jwt: process.env.JWT_SECRET,
  };

  before(() => {
    process.env.JWT_SECRET = "test-secret-cremation-tracker";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.DATABASE_URL;
  });

  after(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.anon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previous.anon;
    if (previous.db === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.db;
    if (previous.jwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.jwt;
  });

  it("rejects register when Supabase is set without DATABASE_URL", async () => {
    const orgService = createMemoryOrgService();
    // Inject local auth so we don't hit real Supabase; guard runs before authService.register.
    const app = createApp({
      authService: createLocalAuthService(),
      orgService,
      caseService: createMemoryCaseService(orgService),
    });
    const res = await request(app).post("/v1/auth/register").send({
      email: "admin@example.com",
      password: "password123",
      name: "Admin",
      org_type: "funeral_home",
      org_name: "Test FH",
    });
    assert.equal(res.status, 503);
    assert.match(res.body.message, /DATABASE_URL/);
  });
});
