"use strict";

const DEFAULT_CONSENT_VERSION = "2026-04-28";
const CONSENT_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getConsentVersion = () => {
  const configuredVersion = String(process.env.CONSENT_VERSION || DEFAULT_CONSENT_VERSION).trim();
  return CONSENT_VERSION_PATTERN.test(configuredVersion) ? configuredVersion : DEFAULT_CONSENT_VERSION;
};

module.exports = {
  DEFAULT_CONSENT_VERSION,
  getConsentVersion,
};
