-- Skip rate is the first thing Instagram ranks reels on; record it with the
-- hook that was used so hook styles can be compared over time.
alter table insights add column if not exists skip_rate numeric(5,2);
alter table insights add column if not exists hook_style text;
alter table insights add column if not exists first_line text;
