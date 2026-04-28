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

revoke all on table public.leads from anon, authenticated;
revoke all on sequence public.leads_id_seq from anon, authenticated;

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

drop policy if exists leads_insert_only on public.leads;

-- Mantem a tabela fechada para chaves publicas do navegador.
-- A insercao deve acontecer somente pela API server-side usando uma chave restrita
-- configurada em SUPABASE_LEADS_INSERT_KEY.
