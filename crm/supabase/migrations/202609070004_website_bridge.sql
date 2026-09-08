-- Minimal, idempotent bridge from the existing website's durable private intake.
-- No file identifiers, Blob URLs, passport or medical fields are accepted.
create table public.crm_website_receipts (
  submission_id text primary key check (submission_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  case_id uuid references public.crm_cases(id) on delete restrict,
  received_at timestamptz not null default now()
);
alter table public.crm_website_receipts enable row level security;
revoke all on public.crm_website_receipts from anon, authenticated;
grant all on public.crm_website_receipts to service_role;

create or replace function public.crm_ingest_website_contact(
  p_submission_id text, p_full_name text, p_phone_e164 text,
  p_email text, p_destination text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  existing_case_id uuid;
  new_case_id uuid;
begin
  if p_submission_id !~ '^[A-Za-z0-9_-]{8,100}$'
    or char_length(p_destination) not between 1 and 120 then
    raise exception 'Invalid website contact' using errcode = '22023';
  end if;

  insert into public.crm_website_receipts (submission_id)
  values (p_submission_id) on conflict (submission_id) do nothing;

  -- The conflict check and row lock serialize retries of one submission. If
  -- any following write fails, the entire receipt/case/task transaction rolls back.
  select r.case_id into existing_case_id from public.crm_website_receipts r
  where r.submission_id = p_submission_id for update;
  if existing_case_id is not null then return existing_case_id; end if;

  select intake.case_id into new_case_id from public.crm_intake_lead(
    p_full_name => p_full_name, p_phone_e164 => p_phone_e164,
    p_service => 'medical_concierge'::public.crm_service_kind,
    p_email => p_email, p_source => 'website'::public.crm_lead_source,
    p_preferred_channel => 'email'::public.crm_preferred_channel,
    p_whatsapp_opt_in => false, p_utm_source => 'existing_website'
  ) intake;

  update public.crm_cases set destination = p_destination where id = new_case_id;
  update public.crm_website_receipts set case_id = new_case_id where submission_id = p_submission_id;
  return new_case_id;
end;
$$;
revoke all on function public.crm_ingest_website_contact(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.crm_ingest_website_contact(text,text,text,text,text) to service_role;
