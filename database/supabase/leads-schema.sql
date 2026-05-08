-- Estrategia aplicada:
-- - O formulario nunca escreve diretamente no Supabase pelo navegador.
-- - Inserts entram pela API Node.js em /api/leads.
-- - SUPABASE_LEADS_INSERT_KEY deve ser uma chave server-side/secret,
--   armazenada apenas em variavel de ambiente do backend.
-- - anon/authenticated/public ficam sem permissoes nesta tabela para evitar
--   bypass de origem, honeypot, rate limit e validacoes da API.
-- - O alerta "RLS enabled but no policies" e seguro neste desenho: sem policy
--   publica e sem grants publicos, chaves anon/publishable nao leem nem inserem.

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  nome text not null,
  whatsapp text not null,
  tipo text not null,
  veiculos integer not null check (veiculos > 0),
  consent_at timestamptz not null default now(),
  consent_version text not null default '2026-04-28',
  consent_ip text not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads
  add column if not exists consent_at timestamptz not null default now(),
  add column if not exists consent_version text not null default '2026-04-28',
  add column if not exists consent_ip text not null default 'unknown';

update public.leads
set
  consent_at = coalesce(consent_at, created_at, now()),
  consent_version = coalesce(nullif(consent_version, ''), '2026-04-28'),
  consent_ip = coalesce(nullif(consent_ip, ''), 'unknown')
where consent_at is null
  or consent_version is null
  or consent_version = ''
  or consent_ip is null
  or consent_ip = '';

alter table public.leads
  alter column consent_at set default now(),
  alter column consent_at set not null,
  alter column consent_version set default '2026-04-28',
  alter column consent_version set not null,
  alter column consent_ip set default 'unknown',
  alter column consent_ip set not null;

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated, public;
revoke all on sequence public.leads_id_seq from anon, authenticated, public;

grant select, insert, delete on table public.leads to service_role;
grant usage, select on sequence public.leads_id_seq to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_nome_length_check'
  ) then
    alter table public.leads
      add constraint leads_nome_length_check
      check (char_length(nome) between 3 and 120) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_whatsapp_digits_check'
  ) then
    alter table public.leads
      add constraint leads_whatsapp_digits_check
      check (char_length(regexp_replace(whatsapp, '\D', '', 'g')) between 10 and 11) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_tipo_allowed_check'
  ) then
    alter table public.leads
      add constraint leads_tipo_allowed_check
      check (tipo in ('Pessoa fisica', 'Empresa / frota')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_veiculos_range_check'
  ) then
    alter table public.leads
      add constraint leads_veiculos_range_check
      check (veiculos between 1 and 9999) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_consent_at_check'
  ) then
    alter table public.leads
      add constraint leads_consent_at_check
      check (consent_at is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_consent_version_format_check'
  ) then
    alter table public.leads
      add constraint leads_consent_version_format_check
      check (consent_version ~ '^\d{4}-\d{2}-\d{2}$') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_consent_ip_length_check'
  ) then
    alter table public.leads
      add constraint leads_consent_ip_length_check
      check (char_length(consent_ip) between 1 and 64) not valid;
  end if;
end $$;

do $$
declare
  existing_policy text;
begin
  for existing_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'leads'
  loop
    execute format('drop policy if exists %I on public.leads', existing_policy);
  end loop;
end $$;

comment on table public.leads is
  'Leads inseridos somente pela API Node.js server-side. RLS fica ativo e anon/authenticated/public nao possuem grants nem policies.';

-- Mantem a tabela fechada para chaves publicas do navegador.
-- A insercao deve acontecer somente pela API server-side usando SUPABASE_LEADS_INSERT_KEY.
-- Nao crie policy para anon nesta arquitetura. Se no futuro o projeto mudar para
-- insert direto do front-end, crie uma policy apenas de INSERT com WITH CHECK,
-- sem SELECT/UPDATE/DELETE, e aceite que ela podera ser chamada fora do site.

do $$
declare
  leads_rls_enabled boolean;
  anon_authenticated_grants integer;
  anon_authenticated_policies integer;
  sequence_usage_open boolean;
  service_role_missing_grants text[];
begin
  select c.relrowsecurity
    into leads_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'leads';

  if coalesce(leads_rls_enabled, false) is not true then
    raise exception 'public.leads must have RLS enabled';
  end if;

  select count(*)
    into anon_authenticated_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'leads'
     and lower(grantee) in ('anon', 'authenticated', 'public');

  if anon_authenticated_grants > 0 then
    raise exception 'public.leads must not grant privileges to anon/authenticated/public';
  end if;

  select count(*)
    into anon_authenticated_policies
    from pg_policies
   where schemaname = 'public'
     and tablename = 'leads'
     and (
       'anon' = any(roles)
       or 'authenticated' = any(roles)
       or 'public' = any(roles)
     );

  if anon_authenticated_policies > 0 then
    raise exception 'public.leads must not expose RLS policies to anon/authenticated/public';
  end if;

  select exists (
    select 1
      from information_schema.role_usage_grants
     where object_schema = 'public'
       and object_name = 'leads_id_seq'
       and lower(grantee) in ('anon', 'authenticated', 'public')
  )
    into sequence_usage_open;

  if sequence_usage_open then
    raise exception 'public.leads_id_seq must not grant USAGE to anon/authenticated/public';
  end if;

  select array_agg(required_privilege)
    into service_role_missing_grants
    from unnest(array['SELECT', 'INSERT', 'DELETE']) as required(required_privilege)
   where not has_table_privilege('service_role', 'public.leads', required_privilege);

  if coalesce(array_length(service_role_missing_grants, 1), 0) > 0 then
    raise exception 'service_role missing table privileges on public.leads: %', service_role_missing_grants;
  end if;

  if not has_sequence_privilege('service_role', 'public.leads_id_seq', 'USAGE') then
    raise exception 'service_role missing USAGE on public.leads_id_seq';
  end if;
end $$;
