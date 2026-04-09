create table if not exists public.leads (
  id bigint generated always as identity primary key,
  nome text not null,
  whatsapp text not null,
  tipo text not null,
  veiculos integer not null check (veiculos > 0),
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
