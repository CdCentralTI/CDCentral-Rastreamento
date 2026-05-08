"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const requestHealth = (port) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
        headers: {
          Host: `127.0.0.1:${port}`,
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, body });
        });
      }
    );

    req.once("error", reject);
    req.end();
  });

const waitForHealth = async (port, child) => {
  const deadline = Date.now() + 5000;
  let lastError = new Error("health check timed out");

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`entrypoint exited early with code ${child.exitCode}`);
    }

    try {
      return await requestHealth(port);
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  throw lastError;
};

const stopChild = async (child) => {
  if (child.exitCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    sleep(2000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
};

const runEntrypointHealthCheck = async (entrypoint) => {
  const port = await getFreePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOST: "0.0.0.0",
    SITE_URL: "https://cdcentral.com.br",
    ALLOWED_ORIGINS: "https://cdcentral.com.br",
    CONSENT_VERSION: "2026-04-28",
    REQUIRE_EXTERNAL_RATE_LIMIT: "0",
  };

  delete env.SUPABASE_URL;
  delete env.SUPABASE_LEADS_INSERT_KEY;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;

  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const response = await waitForHealth(port, child);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { status: "ok" });
  } finally {
    await stopChild(child);
  }

  return { stdout, stderr };
};

test("app.js starts the production server for Hostinger default entry detection", async () => {
  const logs = await runEntrypointHealthCheck("app.js");

  assert.match(logs.stdout, /Servidor rodando em 0\.0\.0\.0:/);
});

test("db.js legacy entrypoint no longer crashes on missing Supabase env", async () => {
  const logs = await runEntrypointHealthCheck("db.js");

  assert.match(logs.stdout, /Servidor rodando em 0\.0\.0\.0:/);
  assert.doesNotMatch(logs.stderr, /supabaseUrl is required/);
});
