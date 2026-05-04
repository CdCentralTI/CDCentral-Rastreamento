"use strict";

process.env.NODE_ENV = "test";
process.env.CRON_SECRET = "cron-secret-test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
process.env.SUPABASE_LEADS_TABLE = "leads";

const assert = require("node:assert/strict");
const test = require("node:test");
const purgeLeadsHandler = require("../api/purge-leads");

const originalFetch = global.fetch;

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

const createRequest = (headers = {}) => ({
  method: "GET",
  headers,
});

test.after(() => {
  global.fetch = originalFetch;
});

test("expurgo LGPD exige segredo de cron", async () => {
  const response = createResponse();

  await purgeLeadsHandler(createRequest(), response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    message: "Nao autorizado.",
  });
});

test("expurgo LGPD apaga leads antigos com Authorization valido", async () => {
  const fetchCalls = [];
  global.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 204,
      statusText: "No Content",
      text: async () => "",
    };
  };

  const response = createResponse();
  await purgeLeadsHandler(
    createRequest({
      authorization: "Bearer cron-secret-test",
    }),
    response
  );

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.retentionMonths, 24);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.method, "DELETE");
  assert.match(fetchCalls[0].url, /created_at=lt\./);
});
