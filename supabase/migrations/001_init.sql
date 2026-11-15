-- @familiar.strange — "Why we do this"
-- Initial schema for the HITL reel pipeline.
-- All writes come from n8n / the render server using the service role key,
-- so RLS is enabled with no public policies (service role bypasses RLS).

-- 1. Topic bank ---------------------------------------------------------------
create table if not exists topics (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                 -- "Why do we tip?"
  angle         text,                          -- the anthropological lens, one line
  everyday_hook text,                          -- the relatable moment it opens with
  sources       jsonb not null default '[]',   -- [{author, work, year, note}]
  status        text not null default 'proposed'
                check (status in ('proposed','approved','rejected','used')),
  batch_week    date,                          -- Monday of the week it was proposed
  notes         text,                          -- NK's comments from review
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists topics_status_idx on topics (status);

-- 2. Reels (one row per reel, moves through the review states) -----------------
create table if not exists reels (
  id               uuid primary key default gen_random_uuid(),
  topic_id         uuid references topics(id) on delete set null,
  status           text not null default 'drafting'
                   check (status in (
                     'drafting','script_review','script_approved','rendering',
                     'video_review','approved','published','rejected','error')),
  script           jsonb,          -- {hook, beats:[{say, show, image_query}], payoff, cta}
  caption          text,
  factcheck        jsonb,          -- second-pass verdicts per claim
  revision         int not null default 1,
  review_notes     text,           -- what NK asked to change
  telegram_chat_id bigint,
  telegram_msg_id  bigint,         -- message holding the approve/edit buttons
  video_url        text,
  duration_s       numeric,
  scheduled_for    timestamptz,
  trial            boolean not null default false,
  ig_media_id      text,
  published_at     timestamptz,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists reels_status_idx on reels (status);
create index if not exists reels_scheduled_idx on reels (scheduled_for) where status = 'approved';

-- 3. Visual assets (public-domain archival images per beat) -------------------
create table if not exists assets (
  id           uuid primary key default gen_random_uuid(),
  reel_id      uuid not null references reels(id) on delete cascade,
  beat_index   int not null,
  provider     text not null,     -- wikimedia | met | smithsonian | loc | rijks
  source_page  text,              -- human-readable page for attribution
  file_url     text not null,     -- direct image URL used in the render
  license      text not null,     -- e.g. 'Public domain', 'CC0'
  attribution  text,
  width        int,
  height       int,
  created_at   timestamptz not null default now(),
  unique (reel_id, beat_index)
);

-- 4. Performance snapshots (pulled daily from the Instagram Insights API) -----
create table if not exists insights (
  id                 bigint generated always as identity primary key,
  reel_id            uuid not null references reels(id) on delete cascade,
  captured_at        timestamptz not null default now(),
  views              int,
  reach              int,
  avg_watch_time_ms  int,
  total_watch_time_ms bigint,
  likes              int,
  comments           int,
  saves              int,
  shares             int,
  follows            int
);
create index if not exists insights_reel_idx on insights (reel_id, captured_at desc);

-- 5. Weekly learning reports ------------------------------------------------
create table if not exists weekly_reports (
  week        date primary key,     -- Monday
  summary     text not null,        -- what Claude sent to Telegram
  learnings   jsonb not null default '{}',  -- {hooks_that_worked:[], topics_that_worked:[], avoid:[]}
  created_at  timestamptz not null default now()
);

-- updated_at triggers -------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists topics_updated on topics;
create trigger topics_updated before update on topics
  for each row execute function set_updated_at();
drop trigger if exists reels_updated on reels;
create trigger reels_updated before update on reels
  for each row execute function set_updated_at();

-- RLS: locked down; only the service role (n8n, render server) touches data --
alter table topics          enable row level security;
alter table reels           enable row level security;
alter table assets          enable row level security;
alter table insights        enable row level security;
alter table weekly_reports  enable row level security;

-- Storage: public bucket so Meta can fetch the mp4 when publishing.
insert into storage.buckets (id, name, public)
values ('reels', 'reels', true)
on conflict (id) do nothing;
