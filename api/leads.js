"use strict";

const { isIP } = require("net");
const { LeadStorageError, normalizeLead, validateLead, saveLeadToSupabase } = require("../lib/leads-service");
const { HttpError, createRateLimiter, readJsonBody } = require("../lib/http-utils");

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MIN_FORM_FILL_TIME_MS = 1500;
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const GENERIC_ERROR_MESSAGE = "Nao foi possivel enviar sua solicitacao agora. Tente novamente em instantes.";
const TRUST_PROXY_HEADERS = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1";

const isLeadRateLimited = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
});

const getAllowedOrigin = (req) => {
  const origin = String(req.headers.origin || "");
  if (!origin) {
    return "";
  }

  const currentHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const explicitOrigins = [
    process.env.SITE_URL,
    process.env.ALLOWED_ORIGINS,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const originUrl = new URL(origin);
    if (currentHost && originUrl.host.toLowerCase() === currentHost) {
      return origin;
    }

    if (explicitOrigins.includes(origin)) {
      return origin;
    }
  } catch (error) {
    return "";
  }

  return "";
};

const normalizeIpCandidate = (value) => {
  let candidate = String(value || "").trim().replace(/^"|"$/g, "");
  if (!candidate) {
    return "";
  }

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else {
    const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (ipv4WithPort) {
      candidate = ipv4WithPort[1];
    }
  }

  candidate = candidate.replace(/^::ffff:/i, "");
  return isIP(candidate) ? candidate : "";
};

const getForwardedForIp = (headerValue) => {
  const candidates = String(headerValue || "")
    .split(",")
    .map(normalizeIpCandidate)
    .filter(Boolean);

  return candidates[0] || "";
};

const getClientIp = (req) => {
  const socketIp = normalizeIpCandidate(req.socket?.remoteAddress);

  if (TRUST_PROXY_HEADERS) {
    return (
      getForwardedForIp(req.headers["x-forwarded-for"]) ||
      normalizeIpCandidate(req.headers["x-real-ip"]) ||
      socketIp ||
      "unknown"
    );
  }

  return socketIp || "unknown";
};

const sendJson = (req, res, statusCode, payload) => {
  const allowedOrigin = getAllowedOrigin(req);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
};

const isSuspiciousFormTiming = (startedAt) => {
  const timestamp = Number(startedAt || 0);
  const elapsed = Date.now() - timestamp;

  return !Number.isFinite(timestamp) || timestamp <= 0 || elapsed < MIN_FORM_FILL_TIME_MS || elapsed > MAX_FORM_AGE_MS;
};

const logApiError = (error) => {
  console.error("Lead API error:", {
    name: error?.name || "Error",
    code: error?.code || "unexpected_error",
    statusCode: error?.statusCode || 500,
    message: error?.message || GENERIC_ERROR_MESSAGE,
    details: error?.details || "",
  });
};

const getStorageErrorStatusCode = (error) => {
  if (error?.code === "missing_supabase_config") {
    return 500;
  }

  return 502;
};

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (origin && !getAllowedOrigin(req)) {
    sendJson(req, res, 403, {
      message: GENERIC_ERROR_MESSAGE,
    });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(req, res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(req, res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  try {
    if (isLeadRateLimited(getClientIp(req))) {
      sendJson(req, res, 429, {
        message: "Muitas tentativas em sequencia. Aguarde um instante e tente novamente.",
      });
      return;
    }

    const body = await readJsonBody(req, { limitBytes: MAX_BODY_BYTES });
    const honeypot = String(body.empresa || "").trim();

    if (honeypot) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    if (isSuspiciousFormTiming(body.startedAt)) {
      sendJson(req, res, 400, {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    const lead = normalizeLead(body);
    const validation = validateLead(lead);

    if (!validation.valid) {
      sendJson(req, res, 422, {
        message: "Preencha nome, WhatsApp, tipo e quantidade de veiculos corretamente.",
        fields: validation.errors,
      });
      return;
    }

    await saveLeadToSupabase(lead);

    sendJson(req, res, 201, {
      message: "Lead recebido com sucesso.",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(req, res, error.statusCode, {
        message: error.statusCode >= 500 ? GENERIC_ERROR_MESSAGE : error.message,
      });
      return;
    }

    if (error instanceof LeadStorageError) {
      logApiError(error);
      sendJson(req, res, getStorageErrorStatusCode(error), {
        message: GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    logApiError(error);
    sendJson(req, res, 500, {
      message: GENERIC_ERROR_MESSAGE,
    });
  }
};
