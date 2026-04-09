"use strict";

const { normalizeLead, validateLead, saveLeadToSupabase } = require("../lib/leads-service");

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(payload));
};

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        reject(new Error("Payload excedeu o limite permitido."));
      }
    });

    req.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("JSON invalido no corpo da requisicao."));
      }
    });

    req.on("error", reject);
  });
};

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const lead = normalizeLead(body);
    const validation = validateLead(lead);

    if (!validation.valid) {
      sendJson(res, 422, {
        message: "Preencha nome, WhatsApp, tipo e quantidade de veiculos corretamente.",
        fields: validation.errors,
      });
      return;
    }

    await saveLeadToSupabase(lead);

    sendJson(res, 201, {
      message: "Lead recebido com sucesso.",
    });
  } catch (error) {
    sendJson(res, 500, {
      message: error.message || "Falha ao salvar lead.",
    });
  }
};
