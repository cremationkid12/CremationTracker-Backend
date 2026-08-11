import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";

describe("GET /v1/health", () => {
  it("returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/v1/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "cremation-tracker-api");
  });
});
