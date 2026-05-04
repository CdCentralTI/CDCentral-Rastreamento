"use strict";

const { assertServerSideSupabaseKey } = require("./leads-service");
const { getTurnstileConfig } = require("./turnstile-config");

const isProductionRuntime = () => process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const getRequiredEnvMissing = (names) => names.filter((name) => !String(process.env[name] || "").trim());

const getProductionSecurityConfigErrors = () => {
  if (!isProductionRuntime()) {
    return [];
  }

  const errors = [];
  const requireTurnstile = String(process.env.REQUIRE_TURNSTILE || "").trim();
  const supabaseInsertKey = String(process.env.SUPABASE_LEADS_INSERT_KEY || "").trim();
  const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const turnstileConfig = getTurnstileConfig();

  if (requireTurnstile !== "1") {
    errors.push("REQUIRE_TURNSTILE must be 1 in production");
  }

  if (turnstileConfig.disabledInProduction) {
    errors.push("REQUIRE_TURNSTILE cannot be 0 in production");
  }

  if (turnstileConfig.missing.length > 0) {
    errors.push(`${turnstileConfig.missing.join(", ")} missing`);
  }

  if (String(process.env.REQUIRE_EXTERNAL_RATE_LIMIT || "").trim() === "0") {
    errors.push("REQUIRE_EXTERNAL_RATE_LIMIT must not be 0 in production");
  }

  const missingUpstash = getRequiredEnvMissing(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
  if (missingUpstash.length > 0) {
    errors.push(`${missingUpstash.join(", ")} missing`);
  }

  if (String(process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION || "").trim() === "1") {
    errors.push("ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION must not be 1 in production");
  }

  const missingSupabase = getRequiredEnvMissing(["SUPABASE_URL", "SUPABASE_LEADS_INSERT_KEY"]);
  if (missingSupabase.length > 0) {
    errors.push(`${missingSupabase.join(", ")} missing`);
  }

  if (!supabaseInsertKey && supabaseServiceRoleKey) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is not accepted; configure SUPABASE_LEADS_INSERT_KEY");
  }

  if (supabaseInsertKey) {
    try {
      assertServerSideSupabaseKey(supabaseInsertKey);
    } catch (error) {
      errors.push("SUPABASE_LEADS_INSERT_KEY must be a server-side key");
    }
  }

  return errors;
};

const assertProductionSecurityConfig = () => {
  const errors = getProductionSecurityConfigErrors();
  if (errors.length > 0) {
    throw new Error(`Production security config invalid: ${errors.join("; ")}`);
  }
};

module.exports = {
  assertProductionSecurityConfig,
  getProductionSecurityConfigErrors,
  isProductionRuntime,
};
