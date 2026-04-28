const header = document.querySelector(".header");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const yearNode = document.querySelector("#current-year");
const revealElements = document.querySelectorAll("[data-reveal]");

const leadForm = document.querySelector("#lead-form");
const submitButton = document.querySelector("#lead-submit");
const feedbackNode = document.querySelector("#form-feedback");
const whatsappInput = document.querySelector("#whatsapp");
const startedAtInput = document.querySelector("#started_at");
<<<<<<< HEAD
=======
const consentVersionInput = document.querySelector("#consent_version");
>>>>>>> 5b8dd71 (mundando para o node.js)
const turnstileNode = document.querySelector("#turnstile-widget");
const keepHeaderScrolled = document.body.classList.contains("legal-page");

const DESKTOP_NAV_BREAKPOINT = 980;
const SUBMIT_TIMEOUT_MS = 10000;
const SUBMIT_IDLE_TEXT = "Receber orçamento";
const SUBMIT_LOADING_TEXT = "Enviando...";
const CONSENT_VERSION = "2026-04-28";
const GENERIC_SUBMIT_ERROR = "Não foi possível enviar agora. Tente novamente em instantes.";
<<<<<<< HEAD
=======
let activeConsentVersion = String(consentVersionInput?.value || "").trim();
>>>>>>> 5b8dd71 (mundando para o node.js)
let turnstileWidgetId = null;
let turnstileReady = false;

const fieldNodes = {
  nome: document.querySelector("#nome"),
  whatsapp: document.querySelector("#whatsapp"),
  tipo: document.querySelector("#tipo"),
  veiculos: document.querySelector("#veiculos"),
  consent: document.querySelector("#consent"),
};

const fieldErrorNodes = {
  nome: document.querySelector("#error-nome"),
  whatsapp: document.querySelector("#error-whatsapp"),
  tipo: document.querySelector("#error-tipo"),
  veiculos: document.querySelector("#error-veiculos"),
  consent: document.querySelector("#error-consent"),
};

const fieldMessages = {
  nome: "Informe seu nome completo.",
  whatsapp: "Informe um WhatsApp válido com DDD.",
  tipo: "Selecione o tipo de atendimento.",
  veiculos: "Informe uma quantidade entre 1 e 9999 veículos.",
  consent: "Confirme a Política de Privacidade para continuar.",
};

const setHeaderState = () => {
  if (header) {
    header.classList.toggle("is-scrolled", keepHeaderScrolled || window.scrollY > 10);
  }
};

const closeMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
};

const formatWhatsapp = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const getTurnstileToken = (formData) => {
  const formToken = String(formData.get("cf-turnstile-response") || "").trim();
  if (formToken || !window.turnstile || turnstileWidgetId === null) {
    return formToken;
  }

  return String(window.turnstile.getResponse(turnstileWidgetId) || "").trim();
};

const getLeadPayload = (formData) => ({
  nome: String(formData.get("nome") || "").trim().replace(/\s+/g, " "),
  whatsapp: String(formData.get("whatsapp") || "").trim(),
  tipo: String(formData.get("tipo") || "").trim(),
  veiculos: String(formData.get("veiculos") || "").trim(),
  empresa: String(formData.get("empresa") || "").trim(),
  startedAt: String(formData.get("started_at") || "").trim(),
  consent: formData.get("consent") === "true",
<<<<<<< HEAD
  consentVersion: String(formData.get("consentVersion") || CONSENT_VERSION).trim(),
=======
  consentVersion: activeConsentVersion || String(formData.get("consentVersion") || "").trim(),
>>>>>>> 5b8dd71 (mundando para o node.js)
  "cf-turnstile-response": getTurnstileToken(formData),
});

const validateLeadPayload = (payload) => {
  const errors = {};
  const digits = payload.whatsapp.replace(/\D/g, "");
  const vehiclesNumber = Number(payload.veiculos);

  if (payload.nome.length < 3) {
    errors.nome = fieldMessages.nome;
  }
  if (digits.length < 10 || digits.length > 11) {
    errors.whatsapp = fieldMessages.whatsapp;
  }
  if (!payload.tipo) {
    errors.tipo = fieldMessages.tipo;
  }
  if (!Number.isInteger(vehiclesNumber) || vehiclesNumber < 1 || vehiclesNumber > 9999) {
    errors.veiculos = fieldMessages.veiculos;
  }
  if (payload.consent !== true) {
    errors.consent = fieldMessages.consent;
  }

  return errors;
};

const setFieldError = (fieldName, message) => {
  const field = fieldNodes[fieldName];
  const errorNode = fieldErrorNodes[fieldName];

  if (field) {
    field.setAttribute("aria-invalid", "true");
  }

  if (errorNode) {
    errorNode.textContent = message;
  }
};

const clearFieldError = (fieldName) => {
  const field = fieldNodes[fieldName];
  const errorNode = fieldErrorNodes[fieldName];

  if (field) {
    field.removeAttribute("aria-invalid");
  }

  if (errorNode) {
    errorNode.textContent = "";
  }
};

const clearAllFieldErrors = () => {
  Object.keys(fieldNodes).forEach(clearFieldError);
};

const setFeedback = (message, status) => {
  if (!feedbackNode) {
    return;
  }

  feedbackNode.textContent = message;
  feedbackNode.classList.remove("is-success", "is-error");

  if (status === "success") {
    feedbackNode.classList.add("is-success");
  }

  if (status === "error") {
    feedbackNode.classList.add("is-error");
  }
};

const setSubmitLoading = (isLoading) => {
  if (!submitButton) {
    return;
  }

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? SUBMIT_LOADING_TEXT : SUBMIT_IDLE_TEXT;

  if (isLoading) {
    submitButton.setAttribute("aria-busy", "true");
  } else {
    submitButton.removeAttribute("aria-busy");
  }
};

const resetStartedAt = () => {
  if (startedAtInput) {
    startedAtInput.value = String(Date.now());
  }
};

const getSubmitErrorMessage = (response) => {
  if (!response) {
    return GENERIC_SUBMIT_ERROR;
  }

  if (response.status === 413) {
    return "Os dados enviados ficaram grandes demais. Revise o formulário e tente novamente.";
  }

  if (response.status === 415) {
    return "Não foi possível processar o envio. Atualize a página e tente novamente.";
  }

  if (response.status === 422) {
    return "Revise os campos destacados e tente novamente.";
  }

  if (response.status === 429) {
    return "Muitas tentativas em sequência. Aguarde um instante e tente novamente.";
  }

  return GENERIC_SUBMIT_ERROR;
};

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const loadPublicConfig = async () => {
  const response = await fetchWithTimeout("/api/public-config", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const config = await response.json().catch(() => ({}));
  if (!response.ok || !config.turnstileSiteKey) {
    throw new Error(GENERIC_SUBMIT_ERROR);
  }

<<<<<<< HEAD
=======
  activeConsentVersion = String(config.consentVersion || activeConsentVersion || "").trim();
  if (consentVersionInput && activeConsentVersion) {
    consentVersionInput.value = activeConsentVersion;
  }

>>>>>>> 5b8dd71 (mundando para o node.js)
  return config;
};

const renderTurnstile = async () => {
  if (!turnstileNode || !window.turnstile || turnstileWidgetId !== null) {
    return;
  }

  try {
    const config = await loadPublicConfig();
    turnstileWidgetId = window.turnstile.render(turnstileNode, {
      sitekey: config.turnstileSiteKey,
      theme: "dark",
      callback: () => {
        turnstileReady = true;
        setFeedback("", "");
      },
      "expired-callback": () => {
        turnstileReady = false;
      },
      "error-callback": () => {
        turnstileReady = false;
        setFeedback("Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.", "error");
      },
    });
  } catch (error) {
    turnstileReady = false;
    setFeedback("Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.", "error");
  }
};

window.onTurnstileLoad = renderTurnstile;

const applyServerFieldErrors = (fields) => {
  if (!Array.isArray(fields)) {
    return;
  }

  fields.forEach((fieldName) => {
    if (fieldMessages[fieldName]) {
      setFieldError(fieldName, fieldMessages[fieldName]);
    }
  });

  const firstInvalidField = fieldNodes[fields.find((fieldName) => fieldNodes[fieldName])];
  if (firstInvalidField) {
    firstInvalidField.focus();
  }
};

const handleLeadSubmit = async (event) => {
  event.preventDefault();
  clearAllFieldErrors();
  setFeedback("", "");

  const formData = new FormData(leadForm);
  const payload = getLeadPayload(formData);

  if (payload.empresa) {
    setFeedback(GENERIC_SUBMIT_ERROR, "error");
    return;
  }

  const validationErrors = validateLeadPayload(payload);

  if (Object.keys(validationErrors).length > 0) {
    Object.entries(validationErrors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });
    setFeedback("Revise os campos destacados e tente novamente.", "error");
    const firstInvalidField = fieldNodes[Object.keys(validationErrors)[0]];
    if (firstInvalidField) {
      firstInvalidField.focus();
    }
    return;
  }

  if (!turnstileReady || !payload["cf-turnstile-response"]) {
    setFeedback("Confirme a verificação de segurança para continuar.", "error");
    return;
  }

  setSubmitLoading(true);

  try {
    const response = await fetchWithTimeout("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      applyServerFieldErrors(result.fields);
      throw new Error(getSubmitErrorMessage(response));
    }

    setFeedback("Solicitação enviada com sucesso. Nossa equipe vai falar com você em breve.", "success");
    leadForm.reset();
    if (whatsappInput) {
      whatsappInput.value = "";
    }
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileReady = false;
    }
    resetStartedAt();
  } catch (error) {
    const isAbortError = error && error.name === "AbortError";
    setFeedback(
      isAbortError ? "O envio demorou mais que o esperado. Verifique sua conexão e tente novamente." : error.message || GENERIC_SUBMIT_ERROR,
      "error"
    );
  } finally {
    setSubmitLoading(false);
  }
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

resetStartedAt();

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  });

  nav.querySelectorAll("a").forEach((anchor) => {
    anchor.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= DESKTOP_NAV_BREAKPOINT) {
      closeMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu();
      menuToggle.focus();
    }
  });
}

if (whatsappInput) {
  whatsappInput.addEventListener("input", (event) => {
    event.target.value = formatWhatsapp(event.target.value);
    clearFieldError("whatsapp");
  });
}

Object.entries(fieldNodes).forEach(([fieldName, fieldNode]) => {
  if (!fieldNode || fieldName === "whatsapp") {
    return;
  }

  const eventName = fieldNode.tagName === "SELECT" || fieldNode.type === "checkbox" ? "change" : "input";
  fieldNode.addEventListener(eventName, () => {
    clearFieldError(fieldName);
  });
});

if ("IntersectionObserver" in window && revealElements.length > 0) {
  const observer = new IntersectionObserver(
    (entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        instance.unobserve(entry.target);
      });
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -30px 0px",
    }
  );
  revealElements.forEach((node) => observer.observe(node));
} else {
  revealElements.forEach((node) => node.classList.add("is-visible"));
}

if (leadForm) {
  leadForm.addEventListener("submit", handleLeadSubmit);
}

if (turnstileNode && window.turnstile) {
  renderTurnstile();
}
