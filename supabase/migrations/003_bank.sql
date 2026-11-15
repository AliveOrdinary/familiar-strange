-- Question bank: what Claude's research adds to each topic.
alter table topics add column if not exists example text;
alter table topics add column if not exists theme text;
alter table topics add column if not exists score int;
