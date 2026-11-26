-- The same reel is posted to Instagram and TikTok; keep their numbers apart.
alter table insights add column if not exists platform text not null default 'instagram';
alter table insights add column if not exists full_watch_rate numeric(5,2);
