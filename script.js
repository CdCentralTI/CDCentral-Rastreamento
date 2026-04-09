const header = document.querySelector(".header");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const yearNode = document.querySelector("#current-year");
const revealElements = document.querySelectorAll("[data-reveal]");

const leadForm = document.querySelector("#lead-form");
const submitButton = document.querySelector("#lead-submit");
const feedbackNode = document.querySelector("#form-feedback");
const whatsappInput = document.querySelector("#whatsapp");

const setHeaderState = () => {
  if (!header) {
    return;
  }
  header.classList.toggle("is-scrolled", window.scrollY > 10);
};

const closeMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
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

const getLeadPayload = (formData) => ({
  nome: String(formData.get("nome") || "").trim().replace(/\s+/g, " "),
  whatsapp: String(formData.get("whatsapp") || "").trim(),
  tipo: String(formData.get("tipo") || "").trim(),
  veiculos: String(formData.get("veiculos") || "").trim(),
});

const validateLeadPayload = (payload) => {
  const digits = payload.whatsapp.replace(/\D/g, "");
  const vehiclesNumber = Number(payload.veiculos);

  if (payload.nome.length < 3) {
    return "Informe um nome valido.";
  }
  if (digits.length < 10 || digits.length > 11) {
    return "Informe um WhatsApp valido com DDD.";
  }
  if (!payload.tipo) {
    return "Selecione o tipo de atendimento.";
  }
  if (!Number.isFinite(vehiclesNumber) || vehiclesNumber < 1) {
    return "Informe a quantidade de veiculos.";
  }
  return null;
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

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((anchor) => {
    anchor.addEventListener("click", () => {
      closeMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 760) {
      closeMenu();
    }
  });
}

if (whatsappInput) {
  whatsappInput.addEventListener("input", (event) => {
    event.target.value = formatWhatsapp(event.target.value);
  });
}

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
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
    }

    setFeedback("", "");

    const formData = new FormData(leadForm);
    const botField = String(formData.get("empresa") || "").trim();

    if (botField) {
      setFeedback("Nao foi possivel enviar. Tente novamente.", "error");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orcamento";
      }
      return;
    }

    const payload = getLeadPayload(formData);
    const validationError = validateLeadPayload(payload);

    if (validationError) {
      setFeedback(validationError, "error");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orcamento";
      }
      return;
    }

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Falha ao enviar formulario.");
      }

      setFeedback("Mensagem enviada com sucesso. Em breve vamos falar com voce.", "success");
      leadForm.reset();
      if (whatsappInput) {
        whatsappInput.value = "";
      }
    } catch (error) {
      setFeedback(error.message || "Falha ao enviar. Tente novamente em instantes.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orcamento";
      }
    }
  });
}
