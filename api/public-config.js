"use strict";

const { getConsentVersion } = require("../lib/app-config");
const { applyApiSecurityHeaders } = require("../lib/api-security-headers");

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  applyApiSecurityHeaders(res);
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  sendJson(res, 200, {
    consentVersion: getConsentVersion(),
  });
};
