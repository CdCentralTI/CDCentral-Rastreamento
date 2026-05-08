"use strict";

const MAX_FIELD_LENGTH = 120;
const MAX_PHONE_DIGITS = 11;
const SUPABASE_TIMEOUT_MS = 8000;
const MIN_LEAD_RETENTION_MONTHS = 24;
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_TYPES = new Set(["pessoa fisica", "empresa / frota"]);
const CANONICAL_TYPES = new Map([
  ["pessoa fisica", "Pessoa fisica"],
  ["empresa / frota", "Empresa / frota"],
]);

class LeadStorageError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LeadStorageError";
    this.code = options.code || "lead_storage_error";
    this.statusCode = options.statusCode || 502;
    this.details = options.details || "";
  }
}

const getNetworkErrorCode = (error) => {
  return String(error?.cause?.code || error?.code || "").trim().toUpperCase();
};

const toLeadStorageError = (error) => {
  if (error instanceof LeadStorageError) {
    return error;
  }

  if (error?.name === "AbortError") {
    return new LeadStorageError("Tempo limite excedido ao salvar lead.", {
      code: "supabase_timeout",
      statusCode: 504,
      details: "abort_timeout",
    });
  }

  const networkCode = getNetworkErrorCode(error);
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(networkCode)) {
    return new LeadStorageError("Servico de armazenamento indisponivel.", {
      code: "supabase_unreachable",
      statusCode: networkCode === "ETIMEDOUT" ? 504 : 503,
      details: networkCode.toLowerCase(),
    });
  }

  return new LeadStorageError("Falha ao salvar lead.", {
    code: "supabase_insert_failed",
    statusCode: 502,
    details: networkCode ? networkCode.toLowerCase() : "",
  });
};

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
    const hasUnexpectedPath = parsedUrl.pathname && parsedUrl.pathname !== "/";

    if (parsedUrl.protocol !== "https:" && !isLocalUrl) {
      throw new Error("Supabase URL precisa usar HTTPS fora do ambiente local.");
    }

    if (hasUnexpectedPath) {
      throw new Error("SUPABASE_URL deve apontar para a raiz do projeto, sem /rest/v1.");
    }

    return parsedUrl.origin;
  } catch (error) {
    throw new LeadStorageError("Configuracao do Supabase invalida.", {
      code: "invalid_supabase_config",
      statusCode: 500,
      details: error?.message || "",
    });
  }
};

const decodeJwtPayload = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(paddedBase64, "base64").toString("utf8"));
  } catch (error) {
    return null;
  }
};

const isPublicSupabaseKey = (key) => {
  const normalizedKey = String(key || "").trim();
  if (normalizedKey.startsWith("sb_publishable_")) {
    return true;
  }

  const payload = decodeJwtPayload(normalizedKey);
  return ["anon", "authenticated"].includes(String(payload?.role || "").toLowerCase());
};

const assertServerSideSupabaseKey = (key) => {
  if (isPublicSupabaseKey(key)) {
    throw new LeadStorageError("Chave publica do Supabase nao e aceita para insert server-side.", {
      code: "unsafe_supabase_key",
      statusCode: 500,
    });
  }
};

const getSupabaseInsertKey = () => {
  const insertKey = String(process.env.SUPABASE_LEADS_INSERT_KEY || "").trim();
  if (insertKey) {
    return insertKey;
  }

  if (String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
    throw new LeadStorageError("SUPABASE_SERVICE_ROLE_KEY nao e aceito como fallback.", {
      code: "missing_supabase_leads_insert_key",
      statusCode: 500,
    });
  }

  return "";
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
  const insertKey = getSupabaseInsertKey();
  const table = process.env.SUPABASE_LEADS_TABLE || "leads";

  if (!url || !insertKey) {
    throw new LeadStorageError("Configuracao do Supabase ausente ou insegura.", {
      code: "missing_supabase_config",
      statusCode: 500,
    });
  }

  assertServerSideSupabaseKey(insertKey);

  if (!TABLE_NAME_PATTERN.test(table)) {
    throw new LeadStorageError("Nome da tabela do Supabase invalido.", {
      code: "invalid_supabase_table",
      statusCode: 500,
    });
  }

  return { url: normalizeSupabaseUrl(url), key: insertKey, table };
};

const getSafeSupabaseErrorDetails = async (response) => {
  const statusDetails = `${response.status} ${response.statusText || ""}`.trim();
  const body = await response.text().catch(() => "");
  const normalizedBody = body.replace(/\s+/g, " ").trim().slice(0, 180);

  return normalizedBody ? `${statusDetails}: ${normalizedBody}` : statusDetails;
};

const getSupabaseErrorCode = (response, details) => {
  if (response.status === 401 || response.status === 403 || /permission denied|42501|rls|row-level/i.test(details)) {
    return "supabase_permission_denied";
  }

  return "supabase_insert_failed";
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
    let response;

    try {
      response = await fetch(endpoint, {
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
    } catch (error) {
      throw toLeadStorageError(error);
    }

    if (!response.ok) {
      const details = await getSafeSupabaseErrorDetails(response);
      throw new LeadStorageError("Falha ao salvar lead.", {
        code: getSupabaseErrorCode(response, details),
        statusCode: response.status === 401 || response.status === 403 ? 502 : response.status,
        details,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
};

const getLeadRetentionCutoff = (olderThanMonths = MIN_LEAD_RETENTION_MONTHS) => {
  const retentionMonths = Number(olderThanMonths);
  if (!Number.isInteger(retentionMonths) || retentionMonths < MIN_LEAD_RETENTION_MONTHS) {
    throw new LeadStorageError("Retencao de leads invalida.", {
      code: "invalid_lead_retention",
      statusCode: 500,
    });
  }

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  return {
    cutoffIso: cutoff.toISOString(),
    retentionMonths,
  };
};

const purgeOldLeadsFromSupabase = async ({ olderThanMonths = MIN_LEAD_RETENTION_MONTHS } = {}) => {
  if (typeof fetch !== "function") {
    throw new Error("Runtime sem suporte a fetch.");
  }

  const config = getSupabaseConfig();
  const { cutoffIso, retentionMonths } = getLeadRetentionCutoff(olderThanMonths);
  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(
    config.table
  )}?created_at=lt.${encodeURIComponent(cutoffIso)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    let response;

    try {
      response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "return=minimal",
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw toLeadStorageError(error);
    }

    if (!response.ok) {
      const details = await getSafeSupabaseErrorDetails(response);
      throw new LeadStorageError("Falha ao expurgar leads antigos.", {
        code: getSupabaseErrorCode(response, details) === "supabase_permission_denied" ? "supabase_permission_denied" : "supabase_purge_failed",
        statusCode: response.status === 401 || response.status === 403 ? 502 : response.status,
        details,
      });
    }

    return {
      cutoffIso,
      retentionMonths,
    };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  assertServerSideSupabaseKey,
  LeadStorageError,
  normalizeLead,
  purgeOldLeadsFromSupabase,
  validateLead,
  saveLeadToSupabase,
};
