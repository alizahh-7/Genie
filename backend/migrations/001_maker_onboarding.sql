alter table wish_maker
  add column if not exists contact_email text,
  add column if not exists country text,
  add column if not exists languages jsonb not null default '[]',
  add column if not exists application_status text not null default 'approved',
  add column if not exists manage_token_hash text unique,
  add column if not exists conduct_accepted_at timestamptz,
  add column if not exists listing_consent_at timestamptz,
  add column if not exists review_note text,
  add column if not exists applied_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz;

alter table wish_maker drop constraint if exists wish_maker_application_status_check;
alter table wish_maker add constraint wish_maker_application_status_check
  check (application_status in ('pending', 'approved', 'rejected', 'paused', 'suspended'));

alter table wish_match
  add column if not exists request_message text,
  add column if not exists family_contact text,
  add column if not exists maker_note text,
  add column if not exists requested_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists concern_flagged boolean not null default false,
  add column if not exists feedback_note text;

alter table wish_match drop constraint if exists wish_match_status_check;
alter table wish_match add constraint wish_match_status_check
  check (status in ('suggested', 'requested', 'accepted', 'declined', 'withdrawn', 'done'));

alter table wish_match drop constraint if exists wish_match_maker_id_fkey;
alter table wish_match add constraint wish_match_maker_id_fkey
  foreign key (maker_id) references wish_maker(id) on delete cascade;

create index if not exists idx_maker_status on wish_maker(application_status);
create index if not exists idx_maker_email on wish_maker(lower(contact_email));