"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const indexPath = path.join(publicRoot, "index.html");
const vercelPath = path.join(root, "vercel.json");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const jsonLdMatch = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);

if (!jsonLdMatch) {
  throw new Error("JSON-LD script block not found in public/index.html.");
}

const hash = crypto.createHash("sha256").update(jsonLdMatch[1]).digest("base64");
const hashDirective = `'sha256-${hash}'`;
const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
const cspHeaders = vercelConfig.headers
  .filter((entry) => entry.source === "/(.*)")
  .flatMap((entry) => entry.headers || [])
  .filter((entry) => ["Content-Security-Policy", "Content-Security-Policy-Report-Only"].includes(entry.key));

if (cspHeaders.length === 0) {
  throw new Error("Content-Security-Policy header not found in vercel.json.");
}

cspHeaders.forEach((cspHeader) => {
  if (/'sha256-[^']+'/.test(cspHeader.value)) {
    cspHeader.value = cspHeader.value.replace(/'sha256-[^']+'/g, hashDirective);
  } else {
    cspHeader.value = cspHeader.value.replace("script-src 'self'", `script-src 'self' ${hashDirective}`);
  }
});

fs.writeFileSync(vercelPath, `${JSON.stringify(vercelConfig, null, 2)}\n`);
console.log(`Updated Content-Security-Policy JSON-LD hash: ${hashDirective}`);
console.log("server.js computes the same JSON-LD hash at startup for Hostinger/VPS deployments.");
