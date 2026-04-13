"use strict";

class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code || "http_error";
  }
}

const parseJson = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    throw new HttpError(400, "JSON invalido no corpo da requisicao.", "invalid_json");
  }
};

const getSerializedBodyBytes = (value) => {
  try {
    return Buffer.byteLength(JSON.stringify(value) || "", "utf8");
  } catch (error) {
    throw new HttpError(400, "JSON invalido no corpo da requisicao.", "invalid_json");
  }
};

const isJsonContentType = (value) => {
  const mediaType = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
};

const readJsonBody = async (req, options = {}) => {
  const limitBytes = options.limitBytes || 16 * 1024;
  const contentType = req.headers["content-type"] || "";

  if (req.method !== "GET" && req.method !== "HEAD" && !isJsonContentType(contentType)) {
    throw new HttpError(415, "Formato de requisicao nao suportado.", "unsupported_media_type");
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
  }

  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return parseJson(req.body.toString("utf8"));
  }

  if (req.body && typeof req.body === "object") {
    if (getSerializedBodyBytes(req.body) > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return req.body;
  }

  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > limitBytes) {
      throw new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large");
    }
    return parseJson(req.body);
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";
    let receivedBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      receivedBytes += chunk.length;
      if (receivedBytes > limitBytes) {
        rejected = true;
        reject(new HttpError(413, "Payload excedeu o limite permitido.", "payload_too_large"));
        return;
      }

      rawBody += chunk;
    });

    req.on("end", () => {
      if (!rejected) {
        resolve(parseJson(rawBody));
      }
    });

    req.on("error", (error) => {
      if (!rejected) {
        reject(error);
      }
    });
  });
};

const createRateLimiter = ({ windowMs, maxRequests, maxKeys = 5000 }) => {
  const requestStore = new Map();

  const pruneStore = (now, currentKey) => {
    if (requestStore.size <= maxKeys) {
      return;
    }

    for (const [storeKey, timestamps] of requestStore.entries()) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        requestStore.delete(storeKey);
      }
    }

    if (requestStore.size <= maxKeys) {
      return;
    }

    const keysByOldestAttempt = [...requestStore.entries()]
      .filter(([storeKey]) => storeKey !== currentKey)
      .sort(([, a], [, b]) => (a[0] || 0) - (b[0] || 0))
      .map(([storeKey]) => storeKey);

    for (const storeKey of keysByOldestAttempt) {
      if (requestStore.size <= maxKeys) {
        break;
      }
      requestStore.delete(storeKey);
    }
  };

  return (key) => {
    const now = Date.now();
    const normalizedKey = key || "unknown";
    const attempts = (requestStore.get(normalizedKey) || []).filter((timestamp) => now - timestamp < windowMs);

    attempts.push(now);
    requestStore.set(normalizedKey, attempts);
    pruneStore(now, normalizedKey);

    return attempts.length > maxRequests;
  };
};

module.exports = {
  HttpError,
  createRateLimiter,
  readJsonBody,
};
