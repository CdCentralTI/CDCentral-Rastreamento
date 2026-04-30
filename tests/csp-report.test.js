"use strict";

process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const cspReportHandler = require("../api/csp-report");

const createResponse = () => {
  const response = {
    headers: {},
    statusCode: 0,
    ended: false,
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = "") {
      this.body = String(body || "");
      this.ended = true;
    },
  };

  return response;
};

const createRequest = (contentType, body) => ({
  method: "POST",
  headers: {
    "content-type": contentType,
  },
  body,
  socket: {
    remoteAddress: "127.0.0.1",
  },
});

test("rejeita application/json silenciosamente em relatorios CSP", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const response = createResponse();
    await cspReportHandler(
      createRequest(
        "application/json",
        JSON.stringify({
          "csp-report": {
            "effective-directive": "script-src",
            "blocked-uri": "https://example.com/script.js",
          },
        })
      ),
      response
    );

    assert.equal(response.statusCode, 204);
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test("processa application/csp-report", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const response = createResponse();
    await cspReportHandler(
      createRequest(
        "application/csp-report",
        JSON.stringify({
          "csp-report": {
            "effective-directive": "script-src",
            "blocked-uri": "https://example.com/script.js",
          },
        })
      ),
      response
    );

    assert.equal(response.statusCode, 204);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
