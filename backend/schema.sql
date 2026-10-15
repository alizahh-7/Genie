create extension if not exists pgcrypto;

create table if not exists person (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  birth_year int,
  region text,
  language text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table if not exists portrait_item (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  domain text not null,
  name text not null,
  qloo_entity_id text,
  qloo_tags jsonb not null default '[]',
  source_label text not null default 'told',
  confidence real,
  resolution_level int,
  created_at timestamptz not null default now()
);

create table if not exists circle_invite (
  token text primary key,
  person_id uuid not null references person(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists circle_response (
  id uuid primary key default gen_random_uuid(),
  token text not null references circle_invite(token) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  contributor_first_name text not null,
  answers jsonb not null default '{}',
  consent_given boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists wish_maker (
  id text primary key,
  name text not null,
  type text not null,
  bio text,
  tags jsonb not null default '[]',
  qloo_entity_ids jsonb not null default '[]',
  city text,
  remote_ok boolean not null default true,
  is_sample boolean not null default true,
  verification_status text not null default 'sample'
);

create table if not exists wish (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  title text not null,
  description text,
  mode text not null default 'remote' check (mode in ('in-person', 'remote')),
  source_items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists wish_match (
  wish_id uuid not null references wish(id) on delete cascade,
  maker_id text not null references wish_maker(id),
  score real,
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'declined', 'done')),
  primary key (wish_id, maker_id)
);

create table if not exists wish_book (
  person_id uuid primary key references person(id) on delete cascade,
  compiled_content jsonb,
  share_token text unique,
  updated_at timestamptz not null default now()
);

create index if not exists idx_portrait_person on portrait_item(person_id);
create index if not exists idx_circle_response_person on circle_response(person_id);
create index if not exists idx_wish_person on wish(person_id);
create index if not exists idx_person_expires on person(expires_at);

-- Lock the tables against Supabase's public API. Our backend connects directly
-- and is not affected. Nobody holding the public key can read family data.
alter table person enable row level security;
alter table portrait_item enable row level security;
alter table circle_invite enable row level security;
alter table circle_response enable row level security;
alter table wish_maker enable row level security;
alter table wish enable row level security;
alter table wish_match enable row level security;
alter table wish_book enable row level security;