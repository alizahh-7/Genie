create table if not exists engine_cache (
  key text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);
alter table engine_cache enable row level security;