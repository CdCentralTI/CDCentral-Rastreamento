"use strict";

const MAX_FIELD_LENGTH = 120;
const MAX_PHONE_DIGITS = 11;
const SUPABASE_TIMEOUT_MS = 8000;
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_TYPES = new Set(["pessoa fisica", "empresa / frota"]);
const CANONICAL_TYPES = new Map([
  ["pessoa fisica", "Pessoa fisica"],
  ["empresa / frota", "Empresa / frota"],
]);

const isProductionLikeRuntime = () => {
  return process.env.NODE_ENV === "production" || ["production", "preview"].includes(process.env.VERCEL_ENV || "");
};

class LeadStorageError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LeadStorageError";
    this.code = options.code || "lead_storage_error";
    this.statusCode = options.statusCode || 502;
    this.details = options.details || "";
  }
}

const normalizeString = (value) => {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_FIELD_LENGTH);
};

const normalizeComparableString = (value) =>
  normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeLeadType = (value) => {
  const normalizedValue = normalizeString(value);
  return CANONICAL_TYPES.get(normalizeComparableString(normalizedValue)) || normalizedValue;
};

const normalizePhoneDigits = (value) => normalizeString(value).replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);

const normalizeVehicleCount = (value) => {
  const normalizedValue = normalizeString(value);
  if (!/^\d+$/.test(normalizedValue)) {
    return NaN;
  }

  return Number(normalizedValue);
};

const normalizeSupabaseUrl = (value) => {
  try {
    const parsedUrl = new URL(value);
    const isLocalUrl = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);

    if (parsedUrl.protocol !== "https:" && !isLocalUrl) {
      throw new Error("Supabase URL precisa usar HTTPS fora do ambiente local.");
    }

    return parsedUrl.toString().replace(/\/$/, "");
  } catch (error) {
    throw new LeadStorageError("Configuracao do Supabase invalida.", {
      code: "invalid_supabase_config",
      statusCode: 500,
    });
  }
};

const normalizeLead = (payload) => {
  return {
    nome: normalizeString(payload.nome),
    whatsapp: normalizePhoneDigits(payload.whatsapp),
    tipo: normalizeLeadType(payload.tipo),
    veiculos: normalizeVehicleCount(payload.veiculos),
  };
};

const validateLead = (lead) => {
  const errors = [];
  const phoneDigits = lead.whatsapp.replace(/\D/g, "");
  const vehicles = Number(lead.veiculos);
  const normalizedType = normalizeComparableString(lead.tipo);

  if (!lead.nome || lead.nome.length < 3) {
    errors.push("nome");
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.push("whatsapp");
  }
  if (!lead.tipo || !ALLOWED_TYPES.has(normalizedType)) {
    errors.push("tipo");
  }
  if (!Number.isInteger(vehicles) || vehicles < 1 || vehicles > 9999) {
    errors.push("veiculos");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "";
  const insertKey = process.env.SUPABASE_LEADS_INSERT_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const allowServiceRoleFallback = process.env.ALLOW_SUPABASE_SERVICE_ROLE_FALLBACK === "1" || !isProductionLikeRuntime();
  const key = insertKey || (allowServiceRoleFallback ? serviceRoleKey : "");
  const table = process.env.SUPABASE_LEADS_TABLE || "leads";

  if (!url || !key) {
    throw new LeadStorageError("Configuracao do Supabase ausente ou insegura.", {
      code: "missing_supabase_config",
      statusCode: 500,
    });
  }

  if (!TABLE_NAME_PATTERN.test(table)) {
    throw new LeadStorageError("Nome da tabela do Supabase invalido.", {
      code: "invalid_supabase_table",
      statusCode: 500,
    });
  }

  return { url: normalizeSupabaseUrl(url), key, table };
};

const saveLeadToSupabase = async (lead) => {
  if (typeof fetch !== "function") {
    throw new Error("Runtime sem suporte a fetch.");
  }

  const config = getSupabaseConfig();
  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(config.table)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([lead]),
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new LeadStorageError("Falha ao salvar lead.", {
        code: "supabase_insert_failed",
        statusCode: response.status,
        details: `${response.status} ${response.statusText || ""}`.trim().slice(0, 120),
      });
    }
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  LeadStorageError,
  normalizeLead,
  validateLead,
  saveLeadToSupabase,
};
