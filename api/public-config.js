"use strict";

<<<<<<< HEAD
=======
const { getConsentVersion } = require("../lib/app-config");

>>>>>>> 5b8dd71 (mundando para o node.js)
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

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";

  if (!turnstileSiteKey) {
    sendJson(res, 500, {
      message: "Configuracao publica indisponivel.",
    });
    return;
  }

  sendJson(res, 200, {
<<<<<<< HEAD
=======
    consentVersion: getConsentVersion(),
>>>>>>> 5b8dd71 (mundando para o node.js)
    turnstileSiteKey,
  });
};
