# Deploy na Hostinger Node.js Web App

Este projeto roda como uma aplicacao Node.js permanente: o mesmo processo serve o site estatico e as rotas `/api/*`.

Referencias uteis da Hostinger:

- Node.js Web App no hPanel: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- Variaveis de ambiente: https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/
- Editar variaveis depois do deploy: https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/
- Cron Jobs no hPanel: https://www.hostinger.com/support/1583465-how-to-set-up-a-cron-job-at-hostinger

## Plano necessario

Use um plano Hostinger com suporte a Node.js Web App. A documentacao da Hostinger lista Business Web Hosting e planos Cloud para Node.js Web Apps. VPS tambem suporta Node.js, mas exige configuracao manual por SSH.

Escolha Node.js 20, 22 ou superior. O `package.json` exige `node >=20`.

## Arquivos para subir

Suba o projeto com estes arquivos e pastas:

```text
api/
lib/
public/
public/assets/images/cdcentral/
public/assets/fonts/
public/.well-known/
public/assets/css/styles.css
public/assets/js/script.js
public/index.html
public/politica-de-privacidade.html
public/termos-de-uso.html
public/robots.txt
public/sitemap.xml
server.js
package.json
package-lock.json
```

Arquivos opcionais para referencia interna, mas nao necessarios no runtime:

```text
README.md
docs/deploy/HOSTINGER.md
docs/deploy/VPS.md
database/supabase/leads-schema.sql
```

Nao suba em ZIP manual:

```text
.env
.env.local
.git/
.claude/
node_modules/
logs/
*.log
*.tmp
server-out.log
server-err.log
```

Se o deploy for via GitHub, mantenha esses arquivos sensiveis fora do repositorio. O servidor tambem bloqueia acesso web a `api/`, `lib/`, `package.json`, `package-lock.json`, `vercel.json`, `.env`, `.git`, `.claude`, `.sql`, logs e arquivos temporarios.

## Configuracao no hPanel

1. Acesse hPanel.
2. Abra Websites e escolha adicionar/deploy de Node.js Web App.
3. Selecione GitHub ou upload de ZIP.
4. Quando o framework nao for detectado, selecione `Other`.
5. Configure o entry file como:

```text
server.js
```

6. Configure o start command como:

```bash
npm start
```

7. Nao configure output directory. Este projeto nao tem build estatico.
8. Confirme Node.js 20 ou superior.
9. Configure as variaveis de ambiente antes do deploy.

## Variaveis de ambiente

Cadastre no hPanel, em Environment Variables:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
TRUST_PROXY_HEADERS=1
ALLOW_LOCAL_ORIGINS=0
REQUIRE_REQUEST_ORIGIN=1
CONSENT_VERSION=2026-04-28
SITE_URL=https://cdcentral.com.br
ALLOWED_ORIGINS=https://cdcentral.com.br
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_LEADS_INSERT_KEY=your_server_side_insert_key
SUPABASE_LEADS_TABLE=leads
REQUIRE_EXTERNAL_RATE_LIMIT=0
CRON_SECRET=your_random_url_safe_secret
```

`CONSENT_VERSION` representa a fonte operacional da versao de consentimento enviada por `/api/public-config` e validada em `/api/leads`. Ao atualizar a Politica de Privacidade, altere essa variavel no hPanel e reinicie/republique a aplicacao.

Nunca coloque `SUPABASE_LEADS_INSERT_KEY`, `CRON_SECRET` ou `UPSTASH_REDIS_REST_TOKEN` no HTML, CSS ou JavaScript publico.

### Supabase

O schema padrao deixa `public.leads` fechada para `anon` e `authenticated`. A estrategia aplicada e:

- o navegador envia leads somente para `/api/leads`;
- a API valida origem, rate limit, payload e consentimento;
- a API grava no Supabase usando `SUPABASE_LEADS_INSERT_KEY` somente no backend;
- use uma chave server-side, preferencialmente `service_role` ou secret key, nunca anon/publishable key.

`SUPABASE_SERVICE_ROLE_KEY` nao e usado como fallback implicito. Se a hospedagem injeta esse nome e voce decidir usa-lo, configure `ALLOW_SUPABASE_SERVICE_ROLE_KEY_FALLBACK=1` conscientemente.

Se voce preferir usar anon/publishable key, sera necessario redesenhar as permissoes com uma funcao server-side segura. Nao exponha insert direto na tabela, pois isso contorna rate limit e validacoes do backend.

### Upstash Redis

`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` sao recomendados em producao para rate limit distribuido. Sem Redis e com `REQUIRE_EXTERNAL_RATE_LIMIT=0`, a API usa fallback em memoria.

`ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION` fica apenas por compatibilidade. Se essa variavel existir no ambiente, mantenha `0`.

Se for usar Upstash, cadastre tambem:

```env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
REQUIRE_EXTERNAL_RATE_LIMIT=1
```

Nao cadastre `UPSTASH_REDIS_REST_URL` ou `UPSTASH_REDIS_REST_TOKEN` com valores placeholder. Se nao tiver Upstash ainda, deixe essas duas variaveis ausentes e mantenha `REQUIRE_EXTERNAL_RATE_LIMIT=0`.

### Expurgo LGPD via Cron Job

Na Vercel, `vercel.json` agenda `/api/purge-leads`. Na Hostinger, essa agenda nao roda automaticamente. Crie um Cron Job diario no hPanel para chamar o endpoint com o mesmo `CRON_SECRET`.

Use uma string URL-safe para `CRON_SECRET` para evitar problemas de escape no shell. Exemplo de comando do cron:

```bash
curl -fsS -H "Authorization: Bearer your_random_url_safe_secret" https://cdcentral.com.br/api/purge-leads
```

Sem o header `Authorization`, `/api/purge-leads` deve responder `401`.

Se alterar variaveis depois do deploy, faca redeploy ou restart pelo painel para o processo Node.js carregar os novos valores.

## Dominio e SSL

1. Aponte o dominio para a Hostinger conforme o DNS do hPanel.
2. Ative SSL no hPanel.
3. Aguarde o certificado ficar ativo.
4. Confirme que `SITE_URL` e `ALLOWED_ORIGINS` usam `https://`.

## Testes apos deploy

Health check:

```bash
curl -i https://cdcentral.com.br/health
```

Resposta esperada:

```json
{"status":"ok"}
```

Config publica:

```bash
curl -i https://cdcentral.com.br/api/public-config
```

Deve responder JSON com `consentVersion`.

Site:

```bash
curl -I https://cdcentral.com.br/
curl -I https://cdcentral.com.br/assets/css/styles.css
curl -I https://cdcentral.com.br/assets/js/script.js
curl -I https://cdcentral.com.br/assets/fonts/manrope-latin.woff2
curl -I https://cdcentral.com.br/.well-known/security.txt
```

`assets/css/styles.css` e `assets/js/script.js` devem responder com `Cache-Control: no-cache`. Imagens e fontes podem usar cache longo.

Arquivos sensiveis devem retornar 404:

```bash
curl -I https://cdcentral.com.br/.env
curl -I https://cdcentral.com.br/package.json
curl -I https://cdcentral.com.br/api/leads.js
curl -I https://cdcentral.com.br/lib/leads-service.js
curl -I https://cdcentral.com.br/database/supabase/leads-schema.sql
```

Envio de lead:

1. Abra `https://cdcentral.com.br/`.
2. Preencha o formulario.
3. Marque o consentimento.
4. Envie e confira se o lead aparece no Supabase.

Expurgo sem autorizacao:

```bash
curl -i https://cdcentral.com.br/api/purge-leads
```

Resposta esperada: `401`.

## Troubleshooting

Erro 404 no site:

- Confirme que `server.js` foi enviado na raiz da aplicacao e que `public/index.html` existe no deploy.
- Confirme que o entry file no hPanel e `server.js`.
- Verifique se o dominio esta conectado a Node.js Web App, nao a uma pasta estatica antiga.

Erro 404 em `/api/public-config`:

- Confirme que a pasta `api/` foi enviada.
- Confirme que o processo esta rodando `npm start`.

Erro 500:

- Verifique logs do deploy/runtime no hPanel.
- Confirme todas as variaveis de ambiente.
- Teste `/health` e `/api/public-config`.
- Se `/api/leads` falhar, valide Supabase e Upstash.
- Se o erro for logo apos o deploy e voce tiver `REQUIRE_EXTERNAL_RATE_LIMIT=1`, confirme se Upstash esta configurado.

Problema com porta:

- Use a porta definida pelo painel, se a Hostinger injetar `PORT`.
- Se configurar manualmente, use `PORT=3000`.
- No Node.js Web App, use `HOST=0.0.0.0` ou omita `HOST`, pois a hospedagem gerenciada precisa acessar o processo.

Problema com Origin/CORS:

- `SITE_URL` deve ser exatamente o dominio publico com `https://`.
- `ALLOWED_ORIGINS` deve conter o dominio publico e, se necessario, dominios temporarios da Hostinger separados por virgula.

Problema com variaveis:

- Confira nomes exatos.
- Depois de editar variaveis no hPanel, reinicie ou redeploy.
