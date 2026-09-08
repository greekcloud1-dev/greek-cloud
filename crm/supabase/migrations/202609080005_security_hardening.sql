-- Enforce integrity at the direct PostgREST boundary, not only in Next.js.
revoke insert (metadata) on public.crm_activities from authenticated;
drop policy crm_activities_insert_staff on public.crm_activities;
create policy crm_activities_insert_staff on public.crm_activities
for insert to authenticated with check (
  public.crm_is_active_staff() and actor_id = auth.uid()
  and metadata = '{}'::jsonb
  and ((kind = 'note_added' and channel = 'system' and nullif(btrim(summary), '') is not null)
    or (kind = 'contact_attempt' and channel in ('phone', 'email', 'whatsapp')))
);
-- System events are still inserted by the existing SECURITY DEFINER triggers.

create function public.crm_validate_active_assignment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare selected_id uuid;
begin
  if tg_table_name = 'crm_cases' then
    if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then return new; end if;
    selected_id := new.owner_id;
  else
    if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;
    selected_id := new.assignee_id;
  end if;
  if selected_id is not null and not exists (
    select 1 from public.crm_profiles where id = selected_id and active
  ) then
    raise exception 'Assignment requires active CRM staff' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.crm_validate_active_assignment() from public, anon, authenticated;
create trigger crm_cases_validate_assignment before insert or update of owner_id on public.crm_cases
for each row execute function public.crm_validate_active_assignment();
create trigger crm_tasks_validate_assignment before insert or update of assignee_id on public.crm_tasks
for each row execute function public.crm_validate_active_assignment();

create or replace function public.crm_intake_lead(
  p_full_name text,
  p_phone_e164 text,
  p_service public.crm_service_kind,
  p_assignee_id uuid default null,
  p_email text default null,
  p_source public.crm_lead_source default 'website',
  p_preferred_channel public.crm_preferred_channel default 'whatsapp',
  p_whatsapp_opt_in boolean default false,
  p_flight_at timestamptz default null,
  p_flight_timezone text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_callback_due_at timestamptz default null
)
returns table (
  contact_id uuid,
  case_id uuid,
  task_id uuid,
  reference_no text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized_name text;
  normalized_phone text;
  normalized_email text;
  normalized_timezone text;
  selected_assignee_id uuid;
  created_contact_id uuid;
  created_case_id uuid;
  created_task_id uuid;
  created_notification_id uuid;
  created_reference_no text;
  callback_due_at timestamptz;
begin
  normalized_name := nullif(btrim(p_full_name), '');
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid contact name is required.' using errcode = '22023';
  end if;

  if p_phone_e164 is null or btrim(p_phone_e164) !~ '^\+' then
    raise exception 'Phone number must start with a country calling code.' using errcode = '22023';
  end if;

  normalized_phone := '+' || regexp_replace(p_phone_e164, '[^0-9]', '', 'g');
  if normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone number must be valid E.164.' using errcode = '22023';
  end if;

  normalized_email := lower(nullif(btrim(p_email), ''));
  if normalized_email is not null and (
    char_length(normalized_email) > 320 or position('@' in normalized_email) <= 1
  ) then
    raise exception 'Email address is invalid.' using errcode = '22023';
  end if;

  normalized_timezone := nullif(btrim(p_flight_timezone), '');
  if p_flight_at is not null and normalized_timezone is null then
    raise exception 'A display timezone is required when a flight time is supplied.'
      using errcode = '22023';
  end if;

  if normalized_timezone is not null and char_length(normalized_timezone) > 64 then
    raise exception 'Flight timezone is too long.' using errcode = '22023';
  end if;

  if p_assignee_id is not null then
    select id
    into selected_assignee_id
    from public.crm_profiles
    where id = p_assignee_id and active;

    if selected_assignee_id is null then
      raise exception 'The requested assignee is not an active CRM user.'
        using errcode = '22023';
    end if;
  else
    select id
    into selected_assignee_id
    from public.crm_profiles
    where active
    order by
      case when role = 'admin' then 0 else 1 end,
      created_at,
      id
    limit 1;

    if selected_assignee_id is null then
      raise exception 'No active CRM user is available for lead assignment.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.crm_contacts (
    full_name,
    phone_e164,
    email,
    preferred_channel,
    whatsapp_opt_in_at,
    whatsapp_opt_in_source
  ) values (
    normalized_name,
    normalized_phone,
    normalized_email,
    p_preferred_channel,
    case when p_whatsapp_opt_in then now() else null end,
    case when p_whatsapp_opt_in then 'public_intake' else null end
  )
  -- A matching phone is not proof of identity. Never enrich an existing
  -- contact or grant consent from an unverified repeat submission.
  on conflict (phone_e164) do nothing
  returning id into created_contact_id;

  if created_contact_id is null then
    select c.id into created_contact_id from public.crm_contacts c
    where c.phone_e164 = normalized_phone;
  end if;
  insert into public.crm_cases as inserted_case (
    contact_id,
    service,
    stage,
    owner_id,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    flight_at,
    flight_timezone
  ) values (
    created_contact_id,
    p_service,
    'new',
    selected_assignee_id,
    p_source,
    left(nullif(btrim(p_utm_source), ''), 160),
    left(nullif(btrim(p_utm_medium), ''), 160),
    left(nullif(btrim(p_utm_campaign), ''), 240),
    left(nullif(btrim(p_utm_content), ''), 240),
    left(nullif(btrim(p_utm_term), ''), 240),
    p_flight_at,
    normalized_timezone
  )
  returning inserted_case.id, inserted_case.reference_no
  into created_case_id, created_reference_no;

  callback_due_at := greatest(
    coalesce(p_callback_due_at, now() + interval '15 minutes'),
    now()
  );

  insert into public.crm_tasks (
    case_id,
    assignee_id,
    kind,
    title,
    due_at,
    priority
  ) values (
    created_case_id,
    selected_assignee_id,
    'follow_up',
    'חזרה לליד חדש',
    callback_due_at,
    case
      when p_flight_at is not null and p_flight_at <= now() + interval '72 hours'
        then 'urgent'::public.crm_task_priority
      else 'normal'::public.crm_task_priority
    end
  )
  returning id into created_task_id;

  insert into public.crm_activities (
    case_id,
    contact_id,
    kind,
    channel,
    metadata
  ) values (
    created_case_id,
    created_contact_id,
    'lead_received',
    'system',
    jsonb_build_object('source', p_source::text, 'contact_basis', 'service_request', 'intake_version', '2026-09-06')
  );

  insert into public.crm_notifications (
    dedupe_key,
    recipient_id,
    event,
    case_id,
    task_id,
    severity,
    title,
    body,
    action_href
  ) values (
    'new_case:' || created_case_id::text,
    selected_assignee_id,
    'new_case',
    created_case_id,
    created_task_id,
    case
      when p_flight_at is not null and p_flight_at <= now() + interval '72 hours'
        then 'urgent'::public.crm_notification_severity
      else 'info'::public.crm_notification_severity
    end,
    'ליד חדש לטיפול',
    'נפתח תיק ' || created_reference_no || ' ונוצרה משימת חזרה.',
    '/crm/?case=' || created_case_id::text
  )
  returning id into created_notification_id;

  insert into public.crm_notification_deliveries (
    notification_id,
    channel,
    status,
    attempts,
    sent_at
  ) values (
    created_notification_id,
    'in_app',
    'sent',
    1,
    now()
  );

  update public.crm_event_outbox
  set payload = payload || jsonb_build_object(
    'task_id', created_task_id::text,
    'notification_id', created_notification_id::text,
    'recipient_id', selected_assignee_id::text
  )
  where dedupe_key = 'new_case:' || created_case_id::text;

  return query
  select
    created_contact_id,
    created_case_id,
    created_task_id,
    created_reference_no;
end;
$$;


