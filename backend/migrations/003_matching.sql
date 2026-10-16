alter table wish_maker add column if not exists qloo_tags jsonb not null default '[]';

alter table wish_match
  add column if not exists reasons jsonb not null default '[]',
  add column if not exists basis text;

alter table wish_match drop constraint if exists wish_match_basis_check;
alter table wish_match add constraint wish_match_basis_check
  check (basis is null or basis in ('qloo', 'text'));