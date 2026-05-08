"use strict";

const { applyApiSecurityHeaders } = require("../lib/api-security-headers");
const { createRateLimiter, getClientIp: getRequestClientIp } = require("../lib/http-utils");

const MAX_REPORT_BYTES = 8 * 1024;
const CSP_REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CSP_REPORT_RATE_LIMIT_MAX_REQUESTS = 20;
const TRUST_PROXY_HEADERS = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const isCspReportRateLimited = createRateLimiter({
  windowMs: CSP_REPORT_RATE_LIMIT_WINDOW_MS,
  maxRequests: CSP_REPORT_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:csp:",
  maxKeys: 1000,
  requireExternalInProduction: true,
});

const getClientIp = (req) => getRequestClientIp(req, { trustProxyHeaders: TRUST_PROXY_HEADERS });

const isCspReportContentType = (value) => {
  const mediaType = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mediaType === "application/csp-report" || mediaType === "application/reports+json";
};

const readBody = async (req) => {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REPORT_BYTES) {
    return "";
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.slice(0, MAX_REPORT_BYTES).toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body.slice(0, MAX_REPORT_BYTES);
  }

  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body).slice(0, MAX_REPORT_BYTES);
  }

  return new Promise((resolve) => {
    let rawBody = "";
    let receivedBytes = 0;

    req.on("data", (chunk) => {
      if (receivedBytes >= MAX_REPORT_BYTES) {
        return;
      }

      receivedBytes += chunk.length;
      rawBody += chunk.toString("utf8");
      if (rawBody.length > MAX_REPORT_BYTES) {
        rawBody = rawBody.slice(0, MAX_REPORT_BYTES);
      }
    });

    req.on("end", () => resolve(rawBody));
    req.on("error", () => resolve(""));
  });
};

const sanitizeText = (value, maxLength = 120) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);

const sanitizeUri = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawValue);
    return `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`.slice(0, 200);
  } catch (error) {
    return sanitizeText(rawValue.split("?")[0], 120);
  }
};

const normalizeReport = (entry) => {
  const report = entry && typeof entry === "object" ? entry["csp-report"] || entry.body || entry : {};

  return {
    disposition: sanitizeText(report.disposition, 40),
    effectiveDirective: sanitizeText(report["effective-directive"] || report.effectiveDirective, 80),
    violatedDirective: sanitizeText(report["violated-directive"] || report.violatedDirective, 120),
    blockedUri: sanitizeUri(report["blocked-uri"] || report.blockedURL || report.blockedUri),
    documentUri: sanitizeUri(report["document-uri"] || report.documentURL || report.documentUri),
    sourceFile: sanitizeUri(report["source-file"] || report.sourceFile),
    statusCode: Number(report["status-code"] || report.statusCode || 0) || 0,
  };
};

const parseReports = (rawBody) => {
  try {
    const parsed = JSON.parse(rawBody || "{}");
    return (Array.isArray(parsed) ? parsed : [parsed]).slice(0, 5).map(normalizeReport);
  } catch (error) {
    return [];
  }
};

const sendNoContent = (res) => {
  res.statusCode = 204;
  res.setHeader("Cache-Control", "no-store");
  applyApiSecurityHeaders(res);
  res.end();
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendNoContent(res);
    return;
  }

  if (!isCspReportContentType(req.headers["content-type"])) {
    sendNoContent(res);
    return;
  }

  try {
    if (await isCspReportRateLimited(getClientIp(req))) {
      sendNoContent(res);
      return;
    }

    const reports = parseReports(await readBody(req)).filter((report) => report.effectiveDirective || report.blockedUri);

    if (reports.length > 0) {
      if (IS_PRODUCTION) {
        console.warn("CSP report received:", {
          count: reports.length,
          directives: [...new Set(reports.map((report) => report.effectiveDirective).filter(Boolean))].slice(0, 5),
        });
      } else {
        console.warn("CSP report:", reports);
      }
    }
  } catch (error) {
    if (!IS_PRODUCTION) {
      console.warn("CSP report ignored:", {
        name: error?.name || "Error",
        code: error?.code || "unexpected_error",
      });
    }
  }

  sendNoContent(res);
};
