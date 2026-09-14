-- Carry the full intake record into the CRM, at the owner's explicit decision.
--
-- Until now the bridge was an operational-fields-only boundary: the health
-- description, passport number, age, prescription answer and the two uploaded
-- files stayed in the website's private storage and never reached the CRM. The
-- owner has decided the staff working a case need all of it, so the boundary
-- moves. That is a policy change, not a bug fix, and it is recorded as one in
-- CLAUDE.md alongside this migration.
--
-- What follows from the decision, and is deliberate:
--
--   * This is special-category health data. The CRM's permission model is a
--     shared team -- every active staff member can read every case -- so every
--     active staff member can now read every health description. Narrowing that
--     is a separate owner decision and a separate migration.
--   * The data is kept in its own table rather than on crm_cases. crm_cases is
--     the operational record and is read constantly; this is the sensitive
--     block, and keeping it separable means stricter RLS, lazy loading or a
--     retention job can be applied to it later without touching cases.
--   * The files themselves are NOT copied here. The table stores only their
--     basenames, which are useless on their own: the website serves each file
--     through a short-lived signed link, and remains the only holder of the
--     bytes. No Blob URL or token is stored.

create table public.crm_case_intake (
  case_id uuid primary key references public.crm_cases(id) on delete cascade,
  passport text check (passport is null or char_length(passport) <= 20),
  age smallint check (age is null or age between 0 and 120),
  -- The free-text health narrative the visitor wrote. The single most sensitive
  -- column in this database.
  condition text check (condition is null or char_length(condition) <= 4000),
  rx_state text check (rx_state is null or rx_state in ('no', 'yes', 'past')),
  -- Which consent boxes were ticked, as submitted. Kept as a record of what was
  -- agreed to, not as something staff can edit.
  consents jsonb not null default '{}'::jsonb,
  -- Basenames only, e.g. 'selfie.jpg' / 'prescription.pdf'. The website
  -- reconstructs the private path from the submission id and serves the bytes
  -- itself behind a signed, expiring link.
  selfie_file text check (selfie_file is null or selfie_file ~ '^[a-z]+\.[a-z0-9]{2,5}$'),
  rx_file text check (rx_file is null or rx_file ~ '^[a-z]+\.[a-z0-9]{2,5}$'),
  created_at timestamptz not null default now()
);

alter table public.crm_case_intake enable row level security;
revoke all on public.crm_case_intake from anon, authenticated;
grant all on public.crm_case_intake to service_role;

-- Active staff read it; nobody edits it. It is a record of what the customer
-- submitted, so a correction belongs in a case note, not in a silent rewrite of
-- what they actually wrote.
grant select on table public.crm_case_intake to authenticated;
create policy crm_case_intake_select_staff on public.crm_case_intake
for select to authenticated using (public.crm_is_active_staff());

comment on table public.crm_case_intake is
  'The full public-intake submission. Special-category health data: read-only to staff, written only by the website bridge.';

create or replace function public.crm_ingest_website_contact(
  p_submission_id text, p_full_name text, p_phone_e164 text,
  p_email text, p_destination text,
  p_plan text default null, p_arrival_on date default null,
  p_locale text default null,
  p_passport text default null, p_age smallint default null,
  p_condition text default null, p_rx_state text default null,
  p_consents jsonb default '{}'::jsonb,
  p_selfie_file text default null, p_rx_file text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  existing_case_id uuid;
  new_case_id uuid;
  new_contact_id uuid;
begin
  if p_submission_id !~ '^[A-Za-z0-9_-]{8,100}$'
    or char_length(p_destination) not between 1 and 120
    or (p_plan is not null and p_plan not in ('standard', 'vip'))
    or (p_locale is not null and p_locale not in ('he', 'en'))
    or (p_rx_state is not null and p_rx_state not in ('no', 'yes', 'past')) then
    raise exception 'Invalid website contact' using errcode = '22023';
  end if;

  insert into public.crm_website_receipts (submission_id)
  values (p_submission_id) on conflict (submission_id) do nothing;

  -- The conflict check and row lock serialize retries of one submission. If
  -- any following write fails, the entire receipt/case/intake transaction rolls back.
  select r.case_id into existing_case_id from public.crm_website_receipts r
  where r.submission_id = p_submission_id for update;
  if existing_case_id is not null then return existing_case_id; end if;

  select intake.case_id, intake.contact_id into new_case_id, new_contact_id
  from public.crm_intake_lead(
    p_full_name => p_full_name, p_phone_e164 => p_phone_e164,
    p_service => 'medical_concierge'::public.crm_service_kind,
    p_email => p_email, p_source => 'website'::public.crm_lead_source,
    -- The site form has no WhatsApp consent box, so the opt-in stays false and
    -- the channel stays email: the visitor gave an email address and agreed to
    -- be contacted, and nothing more than that was asked of them.
    p_preferred_channel => 'email'::public.crm_preferred_channel,
    p_whatsapp_opt_in => false, p_utm_source => 'existing_website'
  ) intake;

  update public.crm_cases set
    destination = p_destination,
    intake_plan = p_plan,
    intake_arrival_on = p_arrival_on
  where id = new_case_id;

  -- A returning customer keeps whichever language they most recently used.
  if p_locale is not null then
    update public.crm_contacts set locale = p_locale where id = new_contact_id;
  end if;

  insert into public.crm_case_intake (
    case_id, passport, age, condition, rx_state, consents, selfie_file, rx_file
  ) values (
    new_case_id, nullif(btrim(p_passport), ''), p_age,
    nullif(btrim(p_condition), ''), p_rx_state,
    coalesce(p_consents, '{}'::jsonb),
    nullif(btrim(p_selfie_file), ''), nullif(btrim(p_rx_file), '')
  );

  update public.crm_website_receipts set case_id = new_case_id where submission_id = p_submission_id;
  return new_case_id;
end;
$$;

-- Replace the eight-argument form from migration 007. The new one still answers
-- a shorter call because every addition defaults, so a site deployment that
-- predates this migration keeps working and simply records no intake detail.
drop function if exists public.crm_ingest_website_contact(text,text,text,text,text,text,date,text);

revoke all on function public.crm_ingest_website_contact(
  text,text,text,text,text,text,date,text,text,smallint,text,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.crm_ingest_website_contact(
  text,text,text,text,text,text,date,text,text,smallint,text,text,jsonb,text,text
) to service_role;

-- The submission id is how the website identifies the files for a case, so
-- staff-facing code needs to read it. It was previously service_role only.
grant select on table public.crm_website_receipts to authenticated;
create policy crm_website_receipts_select_staff on public.crm_website_receipts
for select to authenticated using (public.crm_is_active_staff());
