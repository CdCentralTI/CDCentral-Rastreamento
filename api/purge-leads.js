"use strict";

const crypto = require("crypto");
const { LeadStorageError, purgeOldLeadsFromSupabase } = require("../lib/leads-service");
const { getProductionSecurityConfigErrors } = require("../lib/production-security");

const RETENTION_MONTHS = 24;
const GENERIC_ERROR_MESSAGE = "Nao foi possivel executar a rotina de expurgo agora.";

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.end(JSON.stringify(payload));
};

const hasValidCronAuthorization = (req) => {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(String(req.headers.authorization || "").trim());
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

const logPurgeError = (error) => {
  console.error("Lead purge error:", {
    name: error?.name || "Error",
    code: error?.code || "unexpected_error",
    statusCode: error?.statusCode || 500,
    message: error?.message || GENERIC_ERROR_MESSAGE,
    details: error?.details || "",
  });
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  if (!process.env.CRON_SECRET) {
    sendJson(res, 503, {
      message: GENERIC_ERROR_MESSAGE,
    });
    return;
  }

  if (!hasValidCronAuthorization(req)) {
    sendJson(res, 401, {
      message: "Nao autorizado.",
    });
    return;
  }

  const productionConfigErrors = getProductionSecurityConfigErrors();
  if (productionConfigErrors.length > 0) {
    logPurgeError({
      code: "production_security_config_invalid",
      statusCode: 503,
      message: productionConfigErrors.join("; "),
    });
    sendJson(res, 503, {
      message: GENERIC_ERROR_MESSAGE,
    });
    return;
  }

  try {
    const result = await purgeOldLeadsFromSupabase({ olderThanMonths: RETENTION_MONTHS });
    sendJson(res, 200, {
      ok: true,
      retentionMonths: result.retentionMonths,
      cutoffIso: result.cutoffIso,
    });
  } catch (error) {
    if (error instanceof LeadStorageError) {
      logPurgeError(error);
      sendJson(res, error.statusCode >= 400 ? error.statusCode : 502, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    logPurgeError(error);
    sendJson(res, 500, {
      message: GENERIC_ERROR_MESSAGE,
    });
  }
};
