-- 009: makes the organisation layer production-ready. Safe to run more than once.

-- Columns the dashboard reads. They may already exist.
alter table wish_match add column if not exists requested_at timestamptz;
alter table wish_match add column if not exists responded_at timestamptz;
alter table wish_match add column if not exists concern_flagged boolean not null default false;

-- An opaque key for each story, so the person's real id is never needed in the portal.
alter table org_case add column if not exists case_key text;
update org_case set case_key = 'case_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
where case_key is null;
alter table org_case alter column case_key set not null;
create unique index if not exists org_case_key_idx on org_case (case_key);

-- Who agreed. A record that consent was confirmed, never a medical record.
alter table org_case add column if not exists consent_confirmed_at timestamptz;
alter table org_case add column if not exists consent_by text;

-- Organisations apply here. An admin approves and creates the organisation.
create table if not exists org_application (
  id            text primary key,
  org_name      text not null,
  kind          text not null default 'hospice'
                check (kind in ('hospice', 'hospital', 'care home', 'charity')),
  city          text,
  country       text,
  contact_name  text not null,
  contact_email text not null,
  message       text,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  org_id        text references organisation(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists org_application_status_idx on org_application (status, created_at desc);
alter table org_application enable row level security;