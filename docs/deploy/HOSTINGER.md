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
public/.htaccess
.htaccess
app.js
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

`app.js` tambem foi mantido como entrypoint de compatibilidade para o detector da Hostinger. Mesmo assim, prefira `server.js` no hPanel para deixar explicito qual processo HTTP deve iniciar.

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
ENABLE_CANONICAL_REDIRECT=1
CSP_REPORT_URL=https://cdcentral.com.br/api/csp-report
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_LEADS_INSERT_KEY=your_server_side_insert_key
SUPABASE_LEADS_TABLE=leads
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
REQUIRE_EXTERNAL_RATE_LIMIT=1
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

`SUPABASE_SERVICE_ROLE_KEY` nao e aceito como fallback. Configure explicitamente `SUPABASE_LEADS_INSERT_KEY` com uma chave server-side e remova `SUPABASE_SERVICE_ROLE_KEY` do ambiente para evitar diagnostico ambiguo.

Se voce preferir usar anon/publishable key, sera necessario redesenhar as permissoes com uma funcao server-side segura. Nao exponha insert direto na tabela, pois isso contorna rate limit e validacoes do backend.

### Upstash Redis

`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` sao obrigatorios em producao para rate limit distribuido. Cadastre:

```env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
REQUIRE_EXTERNAL_RATE_LIMIT=1
```

Nao cadastre `UPSTASH_REDIS_REST_URL` ou `UPSTASH_REDIS_REST_TOKEN` com valores placeholder. Se Upstash estiver ausente em producao, `/api/leads` deve falhar fechado com `503` em vez de usar limite em memoria.

### Headers na Hostinger/HCDN

O Node define os headers de seguranca e cache, mas a Hostinger/HCDN pode servir arquivos estaticos diretamente antes do processo Node.js. Por isso `.htaccess` e `public/.htaccess` ficam versionados; confirme qual deles a Hostinger copia para o `public_html` do deploy.

Depois do deploy, confira no hPanel ou por SSH se `/home/{usuario}/domains/{dominio}/public_html/.htaccess` contem as regras deste projeto. Se o hPanel regenerar o arquivo automaticamente, mescle as regras de `.htaccess` no arquivo final sem remover o roteamento Node.js criado pela Hostinger.

Se o dominio continuar retornando `Content-Security-Policy: upgrade-insecure-requests`, remova/desative a regra de seguranca da Hostinger/CDN que injeta essa CSP simplificada ou substitua por esta CSP completa do projeto:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-b/JfdtwQ9VBHDeIKrBLCg8Ptgj9yYk227V66a+jUuL0=' 'sha256-9lcytKYWLs6ENp+o2EFXls1B9LWxFepwHj6ux4L92FM='; script-src-attr 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests
```

Limpe o cache da HCDN depois de alterar `.htaccess` ou headers no hPanel.

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

`/`, paginas HTML, `assets/css/styles.css` e `assets/js/script.js` devem responder com `Cache-Control: no-cache`. Imagens e fontes devem responder com `Cache-Control: public, max-age=31536000, immutable`. O header `Content-Security-Policy` deve conter a politica completa, nao apenas `upgrade-insecure-requests`.

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

Erro 503 logo ao abrir o site:

- Confira nos logs de runtime se o processo esta tentando executar `db.js`, `index.js` ou `app.js` em vez de `server.js`. O entry file correto no hPanel e `server.js`; `app.js` existe apenas como fallback de compatibilidade.
- Confirme que o processo esta rodando `npm start` e que o log mostra `Servidor rodando em 0.0.0.0:<porta>`.
- Em Node.js Web App gerenciado, use `HOST=0.0.0.0` ou remova `HOST`; nao use `HOST=127.0.0.1`.
- Se `/health` responder 200 mas o envio do formulario retornar 503, o Node esta online e o problema esta nas variaveis de API/Supabase, especialmente `SUPABASE_URL` e `SUPABASE_LEADS_INSERT_KEY`.

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
