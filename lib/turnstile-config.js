"use strict";

const getTurnstileConfig = () => {
  const mode = String(process.env.REQUIRE_TURNSTILE || "").trim();
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  const required = mode === "1";
  const explicitlyDisabled = mode === "0";
  const configured = Boolean(siteKey && secretKey);
  const missing = [];

  if ((required || configured) && !siteKey) {
    missing.push("TURNSTILE_SITE_KEY");
  }

  if ((required || configured) && !secretKey) {
    missing.push("TURNSTILE_SECRET_KEY");
  }

  return {
    configured,
    enabled: explicitlyDisabled ? false : required || configured,
    explicitlyDisabled,
    hasSecretKey: Boolean(secretKey),
    missing,
    required,
    siteKey,
  };
};

const isTurnstileFailClosed = (config = getTurnstileConfig()) => config.required && config.missing.length > 0;

module.exports = {
  getTurnstileConfig,
  isTurnstileFailClosed,
};
