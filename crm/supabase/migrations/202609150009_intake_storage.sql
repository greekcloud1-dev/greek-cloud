-- One storage system instead of two.
--
-- The selfie and the prescription used to live in the website's Vercel Blob
-- while everything else about the case lived here. That split was the wrong
-- shape for the one obligation that matters most with this data: deleting a
-- customer meant deleting from two systems, and a miss in either one leaves a
-- face photo behind after somebody asked to be forgotten. SECURITY-NOTES.md
-- already listed retention as open; two stores made it two problems.
--
-- The files now land in a private Supabase bucket, so a case and its files are
-- one row and one prefix in one system, covered by one backup and one deletion.
--
-- The website uploads with a storage-scoped key and nothing more. It must not
-- hold a key that can read this database: if the public site is ever
-- compromised, the blast radius should be "the files", not "every customer".
-- That is why the row still arrives through the authenticated bridge rather
-- than the website writing to the tables directly.

insert into storage.buckets (id, name, public)
values ('intake', 'intake', false)
on conflict (id) do update set public = false;

-- Nobody reaches an object by URL: the bucket is private, and staff read a file
-- through a signed URL the CRM mints for them. These policies are the floor
-- under that -- an anonymous or inactive session has no path to an object even
-- if a signing call is somehow reached.
drop policy if exists crm_intake_objects_select_staff on storage.objects;
create policy crm_intake_objects_select_staff on storage.objects
for select to authenticated
using (bucket_id = 'intake' and public.crm_is_active_staff());

-- Writes belong to the website's service identity alone. Staff upload nothing
-- here: these files are what the customer submitted, and a staff member
-- replacing one would be rewriting the record rather than correcting it.
drop policy if exists crm_intake_objects_write_service on storage.objects;
create policy crm_intake_objects_write_service on storage.objects
for all to service_role
using (bucket_id = 'intake') with check (bucket_id = 'intake');

-- The CRM now signs a path directly, so it stores the path rather than a bare
-- basename. The old columns named a file the CRM could not reach without the
-- website's help; these name one it can.
alter table public.crm_case_intake add column selfie_path text
  check (selfie_path is null or selfie_path ~ '^submissions/[A-Za-z0-9_-]{8,100}/[a-z]+\.[a-z0-9]{2,5}$');
alter table public.crm_case_intake add column rx_path text
  check (rx_path is null or rx_path ~ '^submissions/[A-Za-z0-9_-]{8,100}/[a-z]+\.[a-z0-9]{2,5}$');

alter table public.crm_case_intake drop column selfie_file;
alter table public.crm_case_intake drop column rx_file;

comment on column public.crm_case_intake.selfie_path is
  'Object path in the private intake bucket. Signed on demand; never public.';

-- Dropped first, not replaced: the argument types are unchanged from migration
-- 008 but two parameters are renamed (p_selfie_file -> p_selfie_path), and
-- Postgres refuses a rename inside `create or replace`.
drop function if exists public.crm_ingest_website_contact(
  text,text,text,text,text,text,date,text,text,smallint,text,text,jsonb,text,text
);

create function public.crm_ingest_website_contact(
  p_submission_id text, p_full_name text, p_phone_e164 text,
  p_email text, p_destination text,
  p_plan text default null, p_arrival_on date default null,
  p_locale text default null,
  p_passport text default null, p_age smallint default null,
  p_condition text default null, p_rx_state text default null,
  p_consents jsonb default '{}'::jsonb,
  p_selfie_path text default null, p_rx_path text default null
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

  -- A path must sit under this submission's own prefix. The column constraint
  -- already rejects a malformed path; this rejects a well-formed path that
  -- belongs to somebody else's submission.
  if (p_selfie_path is not null and p_selfie_path !~ ('^submissions/' || p_submission_id || '/'))
    or (p_rx_path is not null and p_rx_path !~ ('^submissions/' || p_submission_id || '/')) then
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
    case_id, passport, age, condition, rx_state, consents, selfie_path, rx_path
  ) values (
    new_case_id, nullif(btrim(p_passport), ''), p_age,
    nullif(btrim(p_condition), ''), p_rx_state,
    coalesce(p_consents, '{}'::jsonb),
    nullif(btrim(p_selfie_path), ''), nullif(btrim(p_rx_path), '')
  );

  update public.crm_website_receipts set case_id = new_case_id where submission_id = p_submission_id;
  return new_case_id;
end;
$$;

revoke all on function public.crm_ingest_website_contact(
  text,text,text,text,text,text,date,text,text,smallint,text,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.crm_ingest_website_contact(
  text,text,text,text,text,text,date,text,text,smallint,text,text,jsonb,text,text
) to service_role;
