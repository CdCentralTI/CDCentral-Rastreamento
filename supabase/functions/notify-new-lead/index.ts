import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL");
const TO_EMAIL = Deno.env.get("NOTIFY_TO_EMAIL");
const SHARED_SECRET = Deno.env.get("NOTIFY_SHARED_SECRET");

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!RESEND_API_KEY || !FROM_EMAIL || !TO_EMAIL || !SHARED_SECRET) {
    console.error("Missing required env vars");
    return new Response("Server misconfigured", { status: 500 });
  }

  if (req.headers.get("x-webhook-secret") !== SHARED_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = (body as { record?: Record<string, unknown> })?.record;
  if (!record) {
    return new Response("No record found", { status: 400 });
  }

  const { id, nome, whatsapp, tipo, veiculos, created_at } = record as {
    id: number | string;
    nome: string;
    whatsapp: string;
    tipo: string;
    veiculos: number;
    created_at: string;
  };

  const dataFormatada = new Date(created_at).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .card { background: #ffffff; border-radius: 8px; padding: 32px; max-width: 520px; margin: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  h2 { color: #1a1a2e; margin-top: 0; }
  .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 8px; border-bottom: 1px solid #f0f0f0; font-size: 15px; }
  td:first-child { color: #666; width: 40%; }
  td:last-child { font-weight: 600; color: #1a1a2e; }
  .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 24px; }
</style></head>
<body>
  <div class="card">
    <h2>Novo Lead Recebido!</h2>
    <span class="badge">Formulário do Site</span>
    <table>
      <tr><td>ID</td><td>#${escapeHtml(id)}</td></tr>
      <tr><td>Nome</td><td>${escapeHtml(nome)}</td></tr>
      <tr><td>WhatsApp</td><td>${escapeHtml(whatsapp)}</td></tr>
      <tr><td>Tipo</td><td>${escapeHtml(tipo)}</td></tr>
      <tr><td>Veículos</td><td>${escapeHtml(veiculos)}</td></tr>
      <tr><td>Data</td><td>${escapeHtml(dataFormatada)}</td></tr>
    </table>
    <div class="footer">CD Central &bull; Notificação automática</div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `Novo lead: ${nome} - ${tipo}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response("Failed to send email: " + err, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
