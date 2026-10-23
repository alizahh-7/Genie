-- 008: the organisation layer (hospices, hospitals, care homes, charities).
-- Safe to run more than once. Nothing here stores clinical information.

create table if not exists organisation (
  id         text primary key,
  name       text not null,
  kind       text not null default 'hospice'
             check (kind in ('hospice', 'hospital', 'care home', 'charity')),
  city       text,
  country    text,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now()
);

-- A member signs in with a private link. Only the hash of the link is stored.
create table if not exists org_member (
  id           text primary key,
  org_id       text not null references organisation(id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('coordinator', 'volunteer', 'viewer')),
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

-- A case is a Genie story that an organisation opened for someone in its care.
-- "reference" is the organisation's own opaque label. It must never be a medical record number.
create table if not exists org_case (
  org_id     text not null references organisation(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  reference  text,
  status     text not null default 'open' check (status in ('open', 'paused', 'closed')),
  created_by text references org_member(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, person_id)
);

-- Who did what, and when. Coordinators can read it.
create table if not exists org_audit (
  id         bigserial primary key,
  org_id     text not null references organisation(id) on delete cascade,
  member_id  text,
  action     text not null,
  target     text,
  created_at timestamptz not null default now()
);

create index if not exists org_case_person_idx on org_case (person_id);
create index if not exists org_audit_org_idx on org_audit (org_id, created_at desc);

alter table organisation enable row level security;
alter table org_member   enable row level security;
alter table org_case     enable row level security;
alter table org_audit    enable row level security;