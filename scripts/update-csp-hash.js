"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const indexPath = path.join(publicRoot, "index.html");
const htaccessPaths = [
  path.join(root, ".htaccess"),
  path.join(publicRoot, ".htaccess"),
];

const indexHtml = fs.readFileSync(indexPath, "utf8");
const jsonLdMatch = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);

if (!jsonLdMatch) {
  throw new Error("JSON-LD script block not found in public/index.html.");
}

const getHashDirective = (value) => `'sha256-${crypto.createHash("sha256").update(value).digest("base64")}'`;
const hashDirectives = [
  getHashDirective(jsonLdMatch[1]),
  getHashDirective(jsonLdMatch[1].replace(/\r\n/g, "\n")),
].filter((directive, index, directives) => directives.indexOf(directive) === index);
const hashDirective = hashDirectives.join(" ");

htaccessPaths.forEach((htaccessPath) => {
  if (!fs.existsSync(htaccessPath)) {
    return;
  }

  const htaccess = fs.readFileSync(htaccessPath, "utf8");
  const updatedHtaccess = htaccess.replace(
    /'sha256-[A-Za-z0-9+/=]+'(?:\s+'sha256-[A-Za-z0-9+/=]+')*/g,
    hashDirective
  );

  if (updatedHtaccess !== htaccess) {
    fs.writeFileSync(htaccessPath, updatedHtaccess);
    console.log(`${path.relative(root, htaccessPath)} CSP hash atualizado.`);
  }
});

console.log(`Content-Security-Policy JSON-LD hash: ${hashDirective}`);
console.log("server.js computes the CSP hash at startup; public/.htaccess mirrors it for Hostinger/HCDN.");
