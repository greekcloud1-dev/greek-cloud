-- Carry the rest of the website intake's OPERATIONAL fields across the bridge.
--
-- The bridge sent five fields: submission id, name, phone, email and city.
-- Everything else the visitor filled in was dropped at the boundary, including
-- three things the staff member working the case actually needs:
--
--   * which plan was bought. Every website lead landed as a generic case with
--     no way to tell a VIP purchase from a standard one -- the single most
--     commercially relevant fact about the request.
--   * the estimated arrival date. The form asks for it and it was discarded,
--     so the first thing anyone had to do was ask the customer again.
--   * the language the request was filled in. The English form fed the same
--     endpoint as the Hebrew one, and the result was indistinguishable, so
--     nothing told staff to answer an English speaker in English.
--
-- What still must NOT cross, and is not added here: the health description,
-- passport number, age, the existing-prescription answer, the selfie, the
-- prescription file, and any Blob path. Those stay in the site's private
-- intake. This bridge remains an operational-fields-only boundary.
--
-- intake_arrival_on is deliberately NOT flight_at. The form asks for an
-- approximate arrival date, which is not a confirmed flight datetime; writing
-- one into flight_at would start reminder countdowns against a guess. Staff
-- set flight_at themselves once the customer confirms an actual flight.

alter table public.crm_cases add column intake_plan text
  check (intake_plan is null or intake_plan in ('standard', 'vip'));
alter table public.crm_cases add column intake_arrival_on date;
alter table public.crm_contacts add column locale text
  check (locale is null or locale in ('he', 'en'));

-- Read-only for staff. These three record what the customer submitted; they
-- are not working fields. Correcting a trip date means setting flight_at, which
-- is already editable and already audited. Table-level SELECT granted in the
-- foundation migration covers the new columns.
comment on column public.crm_cases.intake_plan is
  'Plan chosen on the public website form. Immutable record of the submission.';
comment on column public.crm_cases.intake_arrival_on is
  'Approximate arrival date as submitted. Not a flight time -- see flight_at.';
comment on column public.crm_contacts.locale is
  'Language the request was submitted in. Answer the customer in it.';

create or replace function public.crm_ingest_website_contact(
  p_submission_id text, p_full_name text, p_phone_e164 text,
  p_email text, p_destination text,
  p_plan text default null, p_arrival_on date default null,
  p_locale text default null
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
    or (p_locale is not null and p_locale not in ('he', 'en')) then
    raise exception 'Invalid website contact' using errcode = '22023';
  end if;

  insert into public.crm_website_receipts (submission_id)
  values (p_submission_id) on conflict (submission_id) do nothing;

  -- The conflict check and row lock serialize retries of one submission. If
  -- any following write fails, the entire receipt/case/task transaction rolls back.
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

  update public.crm_website_receipts set case_id = new_case_id where submission_id = p_submission_id;
  return new_case_id;
end;
$$;

-- Drop the old five-argument function so only one definition exists. The new
-- one still answers a five-argument call, because the three additions default
-- to null: a site deployment that predates this migration keeps working and
-- simply records nothing in the new columns, rather than failing every intake.
-- Nothing is silently dropped in the current path -- the ingest route always
-- passes all eight, explicitly.
drop function if exists public.crm_ingest_website_contact(text, text, text, text, text);

revoke all on function public.crm_ingest_website_contact(text,text,text,text,text,text,date,text)
  from public, anon, authenticated;
grant execute on function public.crm_ingest_website_contact(text,text,text,text,text,text,date,text)
  to service_role;
