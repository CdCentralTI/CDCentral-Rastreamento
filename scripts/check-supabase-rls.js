"use strict";

const { getFirstEnv, loadEnvFiles, parseArgs, redact } = require("./lib/env");

const args = parseArgs();
if (!args.env && !args["env-file"] && String(args._[0] || "").includes(".env")) {
  args.env = args._[0];
}

try {
  loadEnvFiles(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const table = String(process.env.SUPABASE_LEADS_TABLE || "leads").trim();
const publicKey = getFirstEnv(["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
const serverKey = getFirstEnv(["SUPABASE_LEADS_INSERT_KEY"]);

const checks = [];

const addCheck = (level, label, detail) => {
  checks.push({ level, label, detail });
};

const requestSupabase = async ({ method, key, path, body }) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text().catch(() => "");

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText || "",
    text: text.replace(/\s+/g, " ").trim().slice(0, 220),
  };
};

const isDenied = (response) => [401, 403, 404].includes(response.status);

(async () => {
  if (!supabaseUrl) {
    addCheck("error", "supabase url", "SUPABASE_URL is missing");
  } else {
    try {
      const parsedUrl = new URL(supabaseUrl);
      if (parsedUrl.pathname && parsedUrl.pathname !== "/") {
        addCheck("error", "supabase url", "SUPABASE_URL must not include /rest/v1 or any path");
      } else {
        addCheck("ok", "supabase url", parsedUrl.origin);
      }
    } catch (error) {
      addCheck("error", "supabase url", "SUPABASE_URL is invalid");
    }
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    addCheck("error", "table", `invalid table name: ${table}`);
  } else {
    addCheck("ok", "table", table);
  }

  if (!publicKey.value) {
    addCheck("error", "public key", "SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required for this check");
  } else {
    addCheck("ok", "public key", `${publicKey.name} loaded (${redact(publicKey.value)})`);
  }

  if (!serverKey.value) {
    addCheck("error", "server key", "SUPABASE_LEADS_INSERT_KEY is missing");
  } else {
    addCheck("ok", "server key", `${serverKey.name} loaded (${redact(serverKey.value)})`);
  }

  if (checks.some((check) => check.level === "error")) {
    throw new Error("required configuration is missing");
  }

  const tablePath = `${encodeURIComponent(table)}?select=*&limit=1`;
  const anonSelect = await requestSupabase({
    method: "GET",
    key: publicKey.value,
    path: tablePath,
  });

  if (isDenied(anonSelect)) {
    addCheck("ok", "anon select", `blocked with ${anonSelect.status}`);
  } else {
    addCheck(
      "error",
      "anon select",
      `returned ${anonSelect.status}; public read should be denied by grants/RLS`
    );
  }

  const anonInsert = await requestSupabase({
    method: "POST",
    key: publicKey.value,
    path: encodeURIComponent(table),
    body: [
      {
        nome: "[ANON SHOULD FAIL]",
        whatsapp: "11999999999",
        tipo: "Pessoa fisica",
        veiculos: 1,
        consent_at: new Date().toISOString(),
        consent_version: process.env.CONSENT_VERSION || "2026-04-28",
        consent_ip: "anon-rls-check",
      },
    ],
  });

  if (isDenied(anonInsert)) {
    addCheck("ok", "anon insert", `blocked with ${anonInsert.status}`);
  } else {
    addCheck(
      "error",
      "anon insert",
      `returned ${anonInsert.status}; public insert should go through /api/leads only`
    );
  }

  const serverSelect = await requestSupabase({
    method: "GET",
    key: serverKey.value,
    path: tablePath,
  });

  if (serverSelect.ok) {
    addCheck("ok", "server key", `can reach table with ${serverSelect.status}`);
  } else {
    addCheck(
      "error",
      "server key",
      `returned ${serverSelect.status}; backend key cannot reach public.${table}`
    );
  }
})()
  .catch((error) => {
    addCheck("error", "check", error.message);
  })
  .finally(() => {
    console.log("Supabase RLS check");
    checks.forEach((check) => {
      console.log(`[${check.level}] ${check.label}: ${check.detail}`);
    });

    const errorCount = checks.filter((check) => check.level === "error").length;
    if (errorCount > 0) {
      console.error(`Supabase RLS check failed: ${errorCount} error(s).`);
      process.exit(1);
    }

    console.log("Supabase RLS check passed.");
  });
