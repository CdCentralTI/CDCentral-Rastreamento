"use strict";

const { loadEnvFiles, normalizeOrigin, parseArgs } = require("./lib/env");

const args = parseArgs();
if (!args.url && /^https?:\/\//i.test(String(args._[0] || ""))) {
  args.url = args._[0];
}

try {
  loadEnvFiles(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const baseUrl = String(args.url || process.env.SMOKE_DEPLOY_URL || process.env.SITE_URL || "").replace(/\/$/, "");
const timeoutMs = Number(args.timeout || 10000);
const checks = [];

if (!baseUrl) {
  console.error("Missing deploy URL. Use --url https://example.com or set SITE_URL.");
  process.exit(1);
}

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(baseUrl);
} catch (error) {
  console.error(`Invalid deploy URL: ${baseUrl}`);
  process.exit(1);
}

const request = async (pathname, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(new URL(pathname, parsedBaseUrl).toString(), {
      redirect: "manual",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const addCheck = (level, label, detail) => {
  checks.push({ level, label, detail });
};

const getHeader = (response, name) => response?.headers?.get(name) || "";

const expectHeader = (response, name, pattern, label, message) => {
  const value = getHeader(response, name);
  if (!pattern.test(value)) {
    addCheck("error", label, `${message}; ${name}="${value}"`);
    return;
  }

  addCheck("ok", label, `${name}=${value}`);
};

const expectFullCsp = (response, label) => {
  const csp = getHeader(response, "content-security-policy");
  if (!/default-src\s+'self'/i.test(csp) || !/frame-ancestors\s+'none'/i.test(csp)) {
    addCheck("error", label, `Content-Security-Policy is incomplete: "${csp}"`);
    return;
  }

  addCheck("ok", label, "Content-Security-Policy is complete");
};

const assertStatus = async (pathname, expectedStatus, label) => {
  let response;
  try {
    response = await request(pathname);
  } catch (error) {
    addCheck("error", label, `${pathname} request failed: ${error.cause?.code || error.message}`);
    return { response: null, body: "" };
  }

  if (response.status !== expectedStatus) {
    addCheck("error", label, `${pathname} returned ${response.status}, expected ${expectedStatus}`);
    return { response, body: "" };
  }

  addCheck("ok", label, `${pathname} returned ${response.status}`);
  return { response, body: await response.text() };
};

(async () => {
  const origin = normalizeOrigin(baseUrl);
  const isLocalUrl = ["localhost", "127.0.0.1", "::1"].includes(parsedBaseUrl.hostname);
  if (!origin || (parsedBaseUrl.protocol !== "https:" && !isLocalUrl)) {
    addCheck("error", "deploy url", "deploy URL must use https outside localhost");
  } else {
    addCheck("ok", "deploy url", origin);
  }

  const home = await assertStatus("/", 200, "home");
  if (home.body && !home.body.includes("<title>CDCentral Rastreamento")) {
    addCheck("error", "home", "home HTML does not contain the expected title");
  }
  if (home.response) {
    expectFullCsp(home.response, "home csp");
    expectHeader(home.response, "strict-transport-security", /max-age=\d+/i, "home security", "HSTS missing");
    expectHeader(home.response, "x-frame-options", /^DENY$/i, "home security", "X-Frame-Options missing");
    expectHeader(home.response, "x-content-type-options", /^nosniff$/i, "home security", "X-Content-Type-Options missing");
    expectHeader(home.response, "referrer-policy", /strict-origin-when-cross-origin/i, "home security", "Referrer-Policy missing");
    expectHeader(home.response, "permissions-policy", /geolocation=\(\)/i, "home security", "Permissions-Policy missing");
    expectHeader(home.response, "cache-control", /(^|,\s*)no-cache(,|$)/i, "home cache", "HTML Cache-Control must be no-cache");
  }

  try {
    const configResponse = await request("/api/public-config");
    if (configResponse.status !== 200) {
      addCheck("error", "public config", `/api/public-config returned ${configResponse.status}`);
    } else {
      const config = await configResponse.json().catch(() => null);
      if (!config || !config.consentVersion) {
        addCheck("error", "public config", "response is not the expected JSON shape");
      } else {
        addCheck("ok", "public config", `consentVersion=${config.consentVersion}`);
      }
    }
    expectFullCsp(configResponse, "public config csp");
    expectHeader(configResponse, "strict-transport-security", /max-age=\d+/i, "public config security", "HSTS missing");
    expectHeader(configResponse, "x-frame-options", /^DENY$/i, "public config security", "X-Frame-Options missing");
    expectHeader(configResponse, "x-content-type-options", /^nosniff$/i, "public config security", "X-Content-Type-Options missing");
  } catch (error) {
    addCheck("error", "public config", `request failed: ${error.cause?.code || error.message}`);
  }

  for (const asset of [
    ["/assets/css/styles.css", /(^|,\s*)no-cache(,|$)/i, "css cache"],
    ["/assets/js/script.js", /(^|,\s*)no-cache(,|$)/i, "js cache"],
    ["/assets/fonts/sora-latin.woff2", /public,\s*max-age=31536000,\s*immutable/i, "font cache"],
  ]) {
    try {
      const assetResponse = await request(asset[0]);
      if (assetResponse.status !== 200) {
        addCheck("error", asset[2], `${asset[0]} returned ${assetResponse.status}`);
      } else {
        expectHeader(assetResponse, "cache-control", asset[1], asset[2], `${asset[0]} Cache-Control is invalid`);
      }
    } catch (error) {
      addCheck("error", asset[2], `request failed: ${error.cause?.code || error.message}`);
    }
  }

  try {
    const webpResponse = await request("/assets/images/cdcentral/veiculo-img-480.webp");
    if (webpResponse.status !== 200) {
      addCheck("error", "assets", `optimized WebP returned ${webpResponse.status}`);
    } else {
      const cacheControl = webpResponse.headers.get("cache-control") || "";
      if (!/public,\s*max-age=31536000,\s*immutable/i.test(cacheControl)) {
        addCheck("error", "assets", `optimized WebP cache-control is "${cacheControl}"`);
      } else {
        addCheck("ok", "assets", "optimized WebP is public and cacheable");
      }
    }
  } catch (error) {
    addCheck("error", "assets", `request failed: ${error.cause?.code || error.message}`);
  }

  console.log(`Deploy smoke check: ${baseUrl}`);
  checks.forEach((check) => {
    console.log(`[${check.level}] ${check.label}: ${check.detail}`);
  });

  const errorCount = checks.filter((check) => check.level === "error").length;
  const warnCount = checks.filter((check) => check.level === "warn").length;
  if (errorCount > 0) {
    console.error(`Deploy smoke failed: ${errorCount} error(s), ${warnCount} warning(s).`);
    process.exit(1);
  }

  console.log(`Deploy smoke passed: ${warnCount} warning(s).`);
})();
