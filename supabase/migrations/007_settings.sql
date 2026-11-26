-- Small app-wide settings, e.g. which narrator voice renders use.
create table if not exists settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table settings enable row level security;
insert into settings (key, value) values ('voice', '{"provider":"kokoro"}') on conflict (key) do nothing;
