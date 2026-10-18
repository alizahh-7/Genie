alter table portrait_item add column if not exists matched_name text;

alter table wish
  add column if not exists kind text,
  add column if not exists maker_type text,
  add column if not exists tags jsonb not null default '[]',
  add column if not exists basis text,
  add column if not exists why text,
  add column if not exists affinity real;

create table if not exists agent_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  step text not null,
  log jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table agent_log enable row level security;
create index if not exists idx_agent_log_person on agent_log(person_id);

update wish_maker set type = 'volunteer' where type = 'volunteer group';