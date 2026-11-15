-- Generated cut-outs and film clips, reviewed before any reel may use them.
create table if not exists library (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('piece', 'clip')),
  name        text not null,
  description text not null,
  prompt      text,
  status      text not null default 'generating' check (status in ('generating', 'pending', 'approved', 'rejected', 'error')),
  file        text,
  aspect      numeric,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, name)
);
alter table library enable row level security;
