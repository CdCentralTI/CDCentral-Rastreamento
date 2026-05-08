-- Trigger que dispara a Edge Function notify-new-lead a cada INSERT em public.leads.
--
-- Pre-requisitos:
--   1. Extensoes pg_net e supabase_vault habilitadas.
--      create extension if not exists pg_net with schema extensions;
--      create extension if not exists supabase_vault with schema vault;
--
--   2. O segredo compartilhado precisa estar no Vault com o nome
--      'notify_new_lead_secret'. Crie/atualize via SQL editor:
--        select vault.create_secret('SEU_SEGREDO_AQUI', 'notify_new_lead_secret');
--      ou, se ja existir:
--        update vault.secrets
--           set secret = 'SEU_SEGREDO_AQUI'
--         where name = 'notify_new_lead_secret';
--
--   3. O mesmo segredo precisa estar configurado como secret da Edge Function
--      (NOTIFY_SHARED_SECRET) para validar o header X-Webhook-Secret.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_lead()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog', 'public'
as $function$
declare
  payload jsonb;
  shared_secret text;
begin
  select decrypted_secret
    into shared_secret
    from vault.decrypted_secrets
   where name = 'notify_new_lead_secret'
   limit 1;

  if shared_secret is null then
    raise warning 'notify_new_lead: vault secret notify_new_lead_secret nao encontrado, pulando notificacao';
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', tg_table_name,
    'record', row_to_json(new)::jsonb
  );

  perform net.http_post(
    url := 'https://oelwpgahytqrlqxhdkqz.supabase.co/functions/v1/notify-new-lead',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', shared_secret
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$function$;

drop trigger if exists on_lead_insert on public.leads;

create trigger on_lead_insert
  after insert on public.leads
  for each row
  execute function public.notify_new_lead();

revoke all on function public.notify_new_lead() from public, anon, authenticated;
