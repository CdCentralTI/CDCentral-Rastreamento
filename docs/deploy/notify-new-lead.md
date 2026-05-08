# Notificacao por e-mail de novos leads

Pipeline:

1. Trigger `on_lead_insert` em `public.leads` chama `public.notify_new_lead()`.
2. A funcao usa `pg_net` para fazer POST em `https://oelwpgahytqrlqxhdkqz.supabase.co/functions/v1/notify-new-lead`, enviando `X-Webhook-Secret` e timeout de 10 segundos.
3. A Edge Function valida o segredo, monta o HTML do e-mail e envia via Resend.

## Por que precisa de dominio verificado no Resend

A versao anterior usava `onboarding@resend.dev` como remetente. Esse remetente e do sandbox do Resend e **so entrega para o e-mail dono da conta**. Para qualquer outro destino o Resend retorna `200` mas descarta o envio. Sintoma: a Edge Function loga sucesso mas a caixa nao recebe nada.

Solucao: verificar um dominio proprio no Resend e usar um remetente desse dominio (ex. `noreply@cdcentral.com.br`).

## Passo a passo de deploy

### 1. Rotacionar a API key do Resend

A chave antiga (`re_ZRiUGkK3_...`) ficou exposta no codigo da Edge Function. Em [resend.com/api-keys](https://resend.com/api-keys):

1. Revogar a chave antiga.
2. Gerar uma nova com permissao `Sending access`.
3. Guardar em local seguro (gerenciador de senhas).

### 2. Verificar o dominio no Resend

Em [resend.com/domains](https://resend.com/domains) > `Add Domain`:

1. Informar o dominio (ex. `cdcentral.com.br`).
2. Adicionar os registros DNS apresentados (SPF, DKIM, normalmente um MX e dois TXT) no painel da Hostinger.
3. Aguardar a verificacao (alguns minutos a algumas horas).
4. Apos verificado, definir o remetente final, ex. `noreply@cdcentral.com.br`.

### 3. Configurar secrets da Edge Function

No painel do Supabase: `Project Settings` > `Edge Functions` > `Secrets`. Definir:

- `RESEND_API_KEY` = nova chave do Resend.
- `NOTIFY_FROM_EMAIL` = `noreply@cdcentral.com.br` (ou outro endereco do dominio verificado).
- `NOTIFY_TO_EMAIL` = `administrativo@cdcentral.com.br`.
- `NOTIFY_SHARED_SECRET` = string aleatoria longa (ex. `openssl rand -hex 32`). Guarde para o passo 4.

Ou via CLI, mantendo o arquivo de secrets fora do Git:

```sh
npx supabase@latest secrets set --env-file ./supabase/.env --project-ref oelwpgahytqrlqxhdkqz
```

### 4. Salvar o segredo no Vault e atualizar o trigger

No SQL Editor do Supabase, criar o segredo no Vault (uma vez):

```sql
select vault.create_secret('COLE_O_SEGREDO_AQUI', 'notify_new_lead_secret');
```

Para rotacionar depois:

```sql
update vault.secrets
   set secret = 'NOVO_SEGREDO'
 where name = 'notify_new_lead_secret';
```

Aplicar o trigger versionado:

```sh
psql "$SUPABASE_DB_URL" -f database/supabase/notify-new-lead-trigger.sql
```

(ou cole o conteudo do arquivo no SQL Editor).

### 5. Fazer deploy da Edge Function

Com Supabase CLI logado no projeto `oelwpgahytqrlqxhdkqz`:

```sh
npx supabase@latest functions deploy notify-new-lead --project-ref oelwpgahytqrlqxhdkqz --no-verify-jwt
```

O arquivo `supabase/config.toml` tambem fixa `verify_jwt = false` para `notify-new-lead`. A autenticacao desta Function e feita pelo header `X-Webhook-Secret`, porque o trigger do Postgres chama a Function sem JWT de usuario.

### 6. Diagnosticar a versao publicada

Antes do teste com lead real, confirme que a Function publicada esta usando a versao atual do codigo:

```sh
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d "{}" \
  https://oelwpgahytqrlqxhdkqz.supabase.co/functions/v1/notify-new-lead
```

Resultado esperado depois do deploy atual: `401 Unauthorized`, porque faltou `X-Webhook-Secret`.

Se responder `400 No record found`, a Function publicada ainda esta em uma versao antiga que nao valida o segredo. Nesse caso, faca novo deploy da Function e confira se o teste acima passa a responder `401`.

### 7. Validar

1. Inserir um lead pela API (`POST /api/leads`).
2. Em `Edge Functions` > `notify-new-lead` > `Logs`, esperar `200`.
3. Em [resend.com/emails](https://resend.com/emails), conferir status `Delivered`.
4. Conferir a caixa de entrada do `NOTIFY_TO_EMAIL`.

Se o Resend marcar `bounced` ou `blocked`, o dominio ainda nao esta totalmente verificado ou o remetente nao bate com o dominio verificado.
