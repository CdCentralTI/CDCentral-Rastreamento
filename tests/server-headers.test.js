"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createAppServer } = require("../server");

let server;
let port;

const request = ({ method = "GET", path = "/", headers = {} }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          Host: "cdcentralrastreamento.com.br",
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });

test.before(async () => {
  server = createAppServer();
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("redireciona host nao canonico em producao com robots noarchive", async () => {
  const response = await request({
    path: "/rastreamento?utm=preview",
    headers: {
      Host: "cd-central.vercel.app",
    },
  });

  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location, "https://cdcentralrastreamento.com.br/rastreamento?utm=preview");
  assert.equal(response.headers["x-robots-tag"], "noindex, nofollow, noarchive");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("serve headers de seguranca fortes no host canonico em producao", async () => {
  const response = await request({ path: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["permissions-policy"], /payment=\(\)/);
  assert.match(response.headers["permissions-policy"], /interest-cohort=\(\)/);
  assert.equal(
    response.headers["reporting-endpoints"],
    'default="https://cdcentralrastreamento.com.br/api/csp-report"'
  );
  assert.equal(response.headers["cross-origin-embedder-policy"], "require-corp");
  assert.equal(response.headers["strict-transport-security"], "max-age=63072000; includeSubDomains; preload");
});
