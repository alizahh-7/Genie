-- 007: the item a discovery wish points at, as its own field.
-- Run this BEFORE deploying the new routers/wishes.py, which writes to the column.

alter table wish add column if not exists discovered text;

update wish
set discovered = regexp_replace(
      regexp_replace(why, '^.* with ', ''),
      ' \(match score.*$', '')
where kind = 'discovery'
  and discovered is null
  and why like '% with % (match score%';