"use strict";

process.env.NODE_ENV = "production";
process.env.VERCEL = "1";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.TURNSTILE_SITE_KEY = "site-key-test";
process.env.TURNSTILE_SECRET_KEY = "secret-key-test";
process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
delete process.env.REQUIRE_TURNSTILE;

const assert = require("node:assert/strict");
const test = require("node:test");
const publicConfigHandler = require("../api/public-config");

const createResponse = () => ({
  headers: {},
  statusCode: 0,
  body: "",
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  end(body = "") {
    this.body = String(body || "");
  },
});

test("public-config falha fechado em producao quando REQUIRE_TURNSTILE nao e 1", async () => {
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).turnstileEnabled, undefined);
});

test("public-config habilita Turnstile em producao com configuracao completa", async () => {
  process.env.REQUIRE_TURNSTILE = "1";
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.turnstileEnabled, true);
  assert.equal(body.turnstileSiteKey, "site-key-test");
});
