-- One rendered video per look ('collage', 'type'), so switching looks doesn't re-render.
alter table reels add column if not exists videos jsonb not null default '{}'::jsonb;
