const http = require("http");
const fs = require("fs");
const path = require("path");
const leadHandler = require("./api/leads");

const root = path.resolve(__dirname);
const rootBoundary = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const port = 4173;
const blockedStaticSegments = new Set([".git", ".vercel", "chrome-profile", "exports", "node_modules"]);
const allowedDotSegments = new Set([".well-known"]);
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const loadEnvFile = (filename) => {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(".env");
loadEnvFile(".env.local");

const sendText = (res, statusCode, message) => {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(message);
};

const isBlockedStaticPath = (filePath) => {
  const relativePath = path.relative(root, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath
    .split(path.sep)
    .some((segment) => (segment.startsWith(".") && !allowedDotSegments.has(segment)) || blockedStaticSegments.has(segment));
};

const apiHandlers = new Map([
  ["/api/leads", leadHandler],
  ["/api/public-config", require("./api/public-config")],
  ["/api/csp-report", require("./api/csp-report")],
]);

http
  .createServer((req, res) => {
    let rawPath = "/";

    try {
      rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch (error) {
      sendText(res, 400, "Bad request");
      return;
    }

    const apiHandler = apiHandlers.get(rawPath);
    if (apiHandler) {
      Promise.resolve(apiHandler(req, res)).catch((error) => {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            message: error.message || "Falha inesperada ao processar o lead.",
          })
        );
      });
      return;
    }

    const requestedPath = rawPath === "/" ? "/index.html" : rawPath;
    const relativePath = requestedPath.replace(/^[/\\]+/, "");
    const filePath = path.resolve(root, relativePath);

    if (!filePath.toLowerCase().startsWith(rootBoundary.toLowerCase())) {
      sendText(res, 403, "Forbidden");
      return;
    }

    if (isBlockedStaticPath(filePath)) {
      sendText(res, 404, "Not found");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        sendText(res, 404, "Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        ...securityHeaders,
        "Content-Type": types[ext] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Local server running at http://127.0.0.1:${port}`);
  });
