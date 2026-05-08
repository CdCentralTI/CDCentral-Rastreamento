"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentral.com.br";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertProductionSecurityConfig, createAppServer, normalizeListenHost, normalizeListenPort } = require("../server");

test("normaliza HOST com letra O para endereco wildcard valido", () => {
  assert.equal(normalizeListenHost("O.O.O.O"), "0.0.0.0");
  assert.equal(normalizeListenHost("0.0.0.0"), "0.0.0.0");
  assert.equal(normalizeListenHost("127.0.0.1"), "127.0.0.1");
});

test("normaliza PORT invalida para porta padrao", () => {
  assert.equal(normalizeListenPort("3O00"), 3000);
  assert.equal(normalizeListenPort("8080"), 8080);
  assert.equal(normalizeListenPort("invalid"), 3000);
  assert.equal(normalizeListenPort("70000"), 3000);
});

test("server sobe site estatico mesmo quando Upstash obrigatorio esta ausente", () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  assert.doesNotThrow(() => createAppServer());
});

test("server sobe mesmo com config de API invalida", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseKey = process.env.SUPABASE_LEADS_INSERT_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_LEADS_INSERT_KEY;

  try {
    assert.doesNotThrow(() => createAppServer());
  } finally {
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_LEADS_INSERT_KEY = originalSupabaseKey;
  }
});

test("server exige Upstash quando rate limit externo e obrigatorio", () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";

  try {
    assert.throws(
      () => assertProductionSecurityConfig(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /UPSTASH_REDIS_REST_URL/.test(error.message) &&
        /UPSTASH_REDIS_REST_TOKEN/.test(error.message)
    );
  } finally {
    process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
    process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
  }
});

test("server exige flag explicita de rate limit externo em producao", () => {
  delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
  process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";

  try {
    assert.throws(
      () => assertProductionSecurityConfig(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /REQUIRE_EXTERNAL_RATE_LIMIT must be 1/.test(error.message)
    );
  } finally {
    process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
  }
});

test("server rejeita SUPABASE_SERVICE_ROLE_KEY como fallback em producao", () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
  process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
  delete process.env.SUPABASE_LEADS_INSERT_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_service_role_test_key";

  try {
    assert.throws(
      () => assertProductionSecurityConfig(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /SUPABASE_LEADS_INSERT_KEY/.test(error.message) &&
        /SUPABASE_SERVICE_ROLE_KEY is not accepted/.test(error.message)
    );
  } finally {
    process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
  }
});

test("server rejeita SUPABASE_LEADS_INSERT_KEY publishable em producao", () => {
  process.env.SUPABASE_LEADS_INSERT_KEY = "sb_publishable_unsafe_key";

  try {
    assert.throws(
      () => assertProductionSecurityConfig(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /SUPABASE_LEADS_INSERT_KEY must be a server-side key/.test(error.message)
    );
  } finally {
    process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
  }
});
