-- Library built ahead of need: catalog entries, checks, costs and toss reasons.
alter table library add column if not exists theme text;
alter table library add column if not exists tags text[];
alter table library add column if not exists source text not null default 'script';
alter table library add column if not exists keyframe text;
alter table library add column if not exists toss_reason text;
alter table library add column if not exists "check" text;
alter table library add column if not exists cost numeric;
alter table library add column if not exists generated_at timestamptz;
update library set generated_at = updated_at where generated_at is null and file is not null;
alter table library drop constraint if exists library_status_check;
alter table library add constraint library_status_check check (status in ('queued', 'generating', 'pending', 'approved', 'rejected', 'error'));
create index if not exists library_queue on library (source, status, kind, created_at);
