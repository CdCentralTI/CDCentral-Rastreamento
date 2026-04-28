"use strict";

const MAX_REPORT_BYTES = 8 * 1024;

const readBody = async (req) => {
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
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.end();
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendNoContent(res);
    return;
  }

  const reports = parseReports(await readBody(req)).filter((report) => report.effectiveDirective || report.blockedUri);

  if (reports.length > 0) {
    console.warn("CSP report:", reports);
  }

  sendNoContent(res);
};
