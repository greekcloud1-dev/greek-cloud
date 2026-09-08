-- GreekCloud CRM foundation.
-- This schema intentionally stores operational data only. It has no columns or
-- storage buckets for medical records, passport data, uploaded documents, or
-- WhatsApp message bodies/attachments.

create extension if not exists pgcrypto with schema extensions;

create type public.crm_role as enum ('admin', 'agent');
create type public.crm_service_kind as enum ('medical_concierge', 'document_translation', 'other');
create type public.crm_case_stage as enum (
  'new',
  'contacted',
  'collecting_details',
  'ready',
  'in_progress',
  'waiting',
  'completed',
  'closed'
);
create type public.crm_waiting_on as enum ('customer', 'team', 'external', 'other');
create type public.crm_lead_source as enum (
  'website',
  'whatsapp',
  'manual',
  'google_ads',
  'meta_ads',
  'referral',
  'other'
);
create type public.crm_preferred_channel as enum ('whatsapp', 'phone', 'email');
create type public.crm_payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.crm_currency as enum ('EUR', 'ILS');
create type public.crm_task_kind as enum ('call', 'whatsapp', 'email', 'follow_up', 'admin', 'other');
create type public.crm_task_priority as enum ('normal', 'high', 'urgent');
create type public.crm_activity_kind as enum (
  'lead_received',
  'case_created',
  'stage_changed',
  'assignment_changed',
  'contact_attempt',
  'note_added',
  'task_created',
  'task_completed',
  'payment_status_changed',
  'flight_changed',
  'whatsapp_opened'
);
create type public.crm_activity_channel as enum ('system', 'whatsapp', 'phone', 'email');
create type public.crm_message_template_channel as enum ('whatsapp', 'email');
create type public.crm_notification_event as enum (
  'new_case',
  'assignment',
  'task_due',
  'task_overdue',
  'flight_14d',
  'flight_7d',
  'flight_72h',
  'flight_24h',
  'stale_case',
  'integration_failed'
);
create type public.crm_notification_channel as enum ('in_app', 'email', 'telegram');
create type public.crm_notification_severity as enum ('info', 'warning', 'urgent');
create type public.crm_delivery_status as enum ('queued', 'sent', 'failed', 'skipped');
create type public.crm_outbox_status as enum ('queued', 'processing', 'processed', 'failed');

create table public.crm_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email text not null unique check (char_length(email) <= 320),
  role public.crm_role not null default 'agent',
  active boolean not null default true,
  telegram_chat_id text check (telegram_chat_id is null or char_length(telegram_chat_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 160),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or char_length(email) <= 320),
  preferred_channel public.crm_preferred_channel not null default 'whatsapp',
  whatsapp_opt_in_at timestamptz,
  whatsapp_opt_in_source text check (
    whatsapp_opt_in_source is null or char_length(whatsapp_opt_in_source) <= 120
  ),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_cases (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique default (
    'GC-' || to_char(now() at time zone 'UTC', 'YYYYMM') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  contact_id uuid not null references public.crm_contacts (id) on delete restrict,
  service public.crm_service_kind not null,
  stage public.crm_case_stage not null default 'new',
  waiting_on public.crm_waiting_on,
  owner_id uuid references public.crm_profiles (id) on delete set null,
  source public.crm_lead_source not null,
  utm_source text check (utm_source is null or char_length(utm_source) <= 160),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 160),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 240),
  utm_content text check (utm_content is null or char_length(utm_content) <= 240),
  utm_term text check (utm_term is null or char_length(utm_term) <= 240),
  flight_at timestamptz,
  flight_timezone text check (flight_timezone is null or char_length(flight_timezone) <= 64),
  price_minor integer check (price_minor is null or price_minor between 0 and 2147483647),
  currency public.crm_currency,
  payment_status public.crm_payment_status not null default 'unpaid',
  closed_reason text check (closed_reason is null or char_length(closed_reason) <= 240),
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_cases_id_contact_unique unique (id, contact_id),
  constraint crm_cases_waiting_state_check check (
    (stage = 'waiting' and waiting_on is not null)
    or (stage <> 'waiting' and waiting_on is null)
  ),
  constraint crm_cases_closed_stage_reason_check check (
    stage <> 'closed' or nullif(btrim(closed_reason), '') is not null
  ),
  constraint crm_cases_price_currency_check check (
    (price_minor is null and currency is null)
    or (price_minor is not null and currency is not null)
  ),
  constraint crm_cases_flight_timezone_pair_check check (
    flight_at is null or nullif(btrim(flight_timezone), '') is not null
  )
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases (id) on delete restrict,
  assignee_id uuid not null references public.crm_profiles (id) on delete restrict,
  kind public.crm_task_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz not null,
  remind_at timestamptz,
  priority public.crm_task_priority not null default 'normal',
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_reminder_check check (remind_at is null or remind_at <= due_at)
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  contact_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  kind public.crm_activity_kind not null,
  channel public.crm_activity_channel,
  summary text check (summary is null or char_length(summary) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint crm_activities_case_contact_fk
    foreign key (case_id, contact_id)
    references public.crm_cases (id, contact_id)
    on delete restrict
);

create table public.crm_message_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,80}$'),
  channel public.crm_message_template_channel not null,
  name text not null check (char_length(name) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  active boolean not null default true,
  applicable_stages public.crm_case_stage[] not null default '{}'::public.crm_case_stage[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_notification_preferences (
  profile_id uuid not null references public.crm_profiles (id) on delete cascade,
  event public.crm_notification_event not null,
  in_app boolean not null default true,
  email boolean not null default false,
  telegram boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, event),
  constraint crm_notification_preferences_has_channel check (in_app or email or telegram)
);

create table public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 240),
  recipient_id uuid not null references public.crm_profiles (id) on delete cascade,
  event public.crm_notification_event not null,
  case_id uuid references public.crm_cases (id) on delete restrict,
  task_id uuid references public.crm_tasks (id) on delete restrict,
  severity public.crm_notification_severity not null default 'info',
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 500),
  action_href text not null check (
    action_href = '/crm' or action_href like '/crm/%'
  ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create table public.crm_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.crm_notifications (id) on delete cascade,
  channel public.crm_notification_channel not null,
  status public.crm_delivery_status not null default 'queued',
  attempts integer not null default 0 check (attempts between 0 and 100),
  provider_message_id text check (
    provider_message_id is null or char_length(provider_message_id) <= 240
  ),
  sent_at timestamptz,
  next_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create table public.crm_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event public.crm_notification_event not null,
  aggregate_type text not null check (aggregate_type in ('case', 'task', 'system')),
  aggregate_id uuid,
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status public.crm_outbox_status not null default 'queued',
  attempts integer not null default 0 check (attempts between 0 and 100),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crm_contacts_email_lower_idx on public.crm_contacts (lower(email)) where email is not null;
create index crm_cases_contact_idx on public.crm_cases (contact_id, created_at desc);
create index crm_cases_stage_idx on public.crm_cases (stage, updated_at desc);
create index crm_cases_owner_idx on public.crm_cases (owner_id, stage) where owner_id is not null;
create index crm_cases_source_idx on public.crm_cases (source, created_at desc);
create index crm_cases_flight_idx on public.crm_cases (flight_at) where flight_at is not null;
create index crm_cases_payment_idx on public.crm_cases (payment_status, created_at desc);
create index crm_tasks_open_due_idx on public.crm_tasks (due_at, priority) where completed_at is null;
create index crm_tasks_assignee_idx on public.crm_tasks (assignee_id, due_at) where completed_at is null;
create index crm_activities_case_timeline_idx on public.crm_activities (case_id, created_at desc);
create index crm_notifications_unread_idx on public.crm_notifications (recipient_id, created_at desc)
  where read_at is null;
create index crm_notification_deliveries_queue_idx
  on public.crm_notification_deliveries (status, next_attempt_at)
  where status in ('queued', 'failed');
create index crm_event_outbox_queue_idx on public.crm_event_outbox (available_at, created_at)
  where status in ('queued', 'failed');

create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_profiles_set_updated_at
before update on public.crm_profiles
for each row execute function public.crm_set_updated_at();

create trigger crm_contacts_set_updated_at
before update on public.crm_contacts
for each row execute function public.crm_set_updated_at();

create trigger crm_cases_set_updated_at
before update on public.crm_cases
for each row execute function public.crm_set_updated_at();

create trigger crm_tasks_set_updated_at
before update on public.crm_tasks
for each row execute function public.crm_set_updated_at();

create trigger crm_message_templates_set_updated_at
before update on public.crm_message_templates
for each row execute function public.crm_set_updated_at();

create trigger crm_notification_preferences_set_updated_at
before update on public.crm_notification_preferences
for each row execute function public.crm_set_updated_at();

create trigger crm_notification_deliveries_set_updated_at
before update on public.crm_notification_deliveries
for each row execute function public.crm_set_updated_at();

create trigger crm_event_outbox_set_updated_at
before update on public.crm_event_outbox
for each row execute function public.crm_set_updated_at();

create or replace function public.crm_sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inferred_name text;
begin
  if new.email is null then
    return new;
  end if;

  inferred_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.crm_profiles (id, display_name, email)
  values (new.id, left(inferred_name, 120), lower(new.email))
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = case
      when nullif(btrim(public.crm_profiles.display_name), '') is null
        then excluded.display_name
      else public.crm_profiles.display_name
    end,
    updated_at = now();

  return new;
end;
$$;

create trigger crm_auth_user_created
after insert on auth.users
for each row execute function public.crm_sync_auth_user_profile();

create trigger crm_auth_user_email_updated
after update of email on auth.users
for each row execute function public.crm_sync_auth_user_profile();

create or replace function public.crm_seed_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crm_notification_preferences (
    profile_id,
    event,
    in_app,
    email,
    telegram
  )
  select
    new.id,
    event_name,
    true,
    event_name = any(array[
      'new_case',
      'task_due',
      'task_overdue',
      'flight_7d',
      'flight_72h',
      'flight_24h',
      'integration_failed'
    ]::public.crm_notification_event[]),
    event_name = any(array[
      'new_case',
      'task_overdue',
      'flight_72h',
      'flight_24h',
      'integration_failed'
    ]::public.crm_notification_event[])
  from unnest(enum_range(null::public.crm_notification_event)) as event_name
  on conflict (profile_id, event) do nothing;

  return new;
end;
$$;

create trigger crm_profile_seed_notification_preferences
after insert on public.crm_profiles
for each row execute function public.crm_seed_notification_preferences();

create or replace function public.crm_record_case_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activities (
      case_id,
      contact_id,
      actor_id,
      kind,
      channel,
      metadata
    ) values (
      new.id,
      new.contact_id,
      auth.uid(),
      'case_created',
      'system',
      jsonb_build_object('stage', new.stage::text, 'source', new.source::text)
    );

    insert into public.crm_event_outbox (
      event,
      aggregate_type,
      aggregate_id,
      dedupe_key,
      payload
    ) values (
      'new_case',
      'case',
      new.id,
      'new_case:' || new.id::text,
      jsonb_build_object(
        'case_id', new.id::text,
        'owner_id', new.owner_id::text,
        'reference_no', new.reference_no
      )
    );

    return new;
  end if;

  if old.stage is distinct from new.stage then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.id,
      new.contact_id,
      auth.uid(),
      'stage_changed',
      'system',
      jsonb_build_object('from', old.stage::text, 'to', new.stage::text)
    );
  end if;

  if old.owner_id is distinct from new.owner_id then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.id,
      new.contact_id,
      auth.uid(),
      'assignment_changed',
      'system',
      jsonb_build_object('from', old.owner_id::text, 'to', new.owner_id::text)
    );

    if new.owner_id is not null then
      insert into public.crm_event_outbox (
        event, aggregate_type, aggregate_id, dedupe_key, payload
      ) values (
        'assignment',
        'case',
        new.id,
        'assignment:' || new.id::text || ':' || gen_random_uuid()::text,
        jsonb_build_object(
          'case_id', new.id::text,
          'owner_id', new.owner_id::text,
          'previous_owner_id', old.owner_id::text
        )
      );
    end if;
  end if;

  if old.payment_status is distinct from new.payment_status then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.id,
      new.contact_id,
      auth.uid(),
      'payment_status_changed',
      'system',
      jsonb_build_object(
        'from', old.payment_status::text,
        'to', new.payment_status::text
      )
    );
  end if;

  if old.flight_at is distinct from new.flight_at
    or old.flight_timezone is distinct from new.flight_timezone then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.id,
      new.contact_id,
      auth.uid(),
      'flight_changed',
      'system',
      jsonb_build_object(
        'from', old.flight_at::text,
        'to', new.flight_at::text,
        'timezone', new.flight_timezone
      )
    );
  end if;

  return new;
end;
$$;

create trigger crm_cases_record_activity
after insert or update on public.crm_cases
for each row execute function public.crm_record_case_activity();

create or replace function public.crm_record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_contact_id uuid;
begin
  select contact_id
  into task_contact_id
  from public.crm_cases
  where id = new.case_id;

  if tg_op = 'INSERT' then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.case_id,
      task_contact_id,
      auth.uid(),
      'task_created',
      'system',
      jsonb_build_object('task_id', new.id::text, 'kind', new.kind::text)
    );
  elsif old.completed_at is null and new.completed_at is not null then
    insert into public.crm_activities (
      case_id, contact_id, actor_id, kind, channel, metadata
    ) values (
      new.case_id,
      task_contact_id,
      auth.uid(),
      'task_completed',
      'system',
      jsonb_build_object('task_id', new.id::text)
    );
  end if;

  return new;
end;
$$;

create trigger crm_tasks_record_activity
after insert or update of completed_at on public.crm_tasks
for each row execute function public.crm_record_task_activity();

create or replace function public.crm_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.crm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_profiles
    where id = auth.uid() and active and role = 'admin'
  );
$$;

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
  on conflict (phone_e164) do update
  set
    email = coalesce(public.crm_contacts.email, excluded.email),
    whatsapp_opt_in_at = coalesce(
      public.crm_contacts.whatsapp_opt_in_at,
      excluded.whatsapp_opt_in_at
    ),
    whatsapp_opt_in_source = coalesce(
      public.crm_contacts.whatsapp_opt_in_source,
      excluded.whatsapp_opt_in_source
    ),
    updated_at = now()
  returning id into created_contact_id;

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

revoke all on function public.crm_sync_auth_user_profile() from public;
revoke all on function public.crm_seed_notification_preferences() from public;
revoke all on function public.crm_record_case_activity() from public;
revoke all on function public.crm_record_task_activity() from public;
revoke all on function public.crm_set_updated_at() from public;
revoke all on function public.crm_is_active_staff() from public;
revoke all on function public.crm_is_admin() from public;
revoke all on function public.crm_intake_lead(
  text,
  text,
  public.crm_service_kind,
  uuid,
  text,
  public.crm_lead_source,
  public.crm_preferred_channel,
  boolean,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.crm_is_active_staff() to authenticated, service_role;
grant execute on function public.crm_is_admin() to authenticated, service_role;
grant execute on function public.crm_intake_lead(
  text,
  text,
  public.crm_service_kind,
  uuid,
  text,
  public.crm_lead_source,
  public.crm_preferred_channel,
  boolean,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

alter table public.crm_profiles enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_cases enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_message_templates enable row level security;
alter table public.crm_notification_preferences enable row level security;
alter table public.crm_notifications enable row level security;
alter table public.crm_notification_deliveries enable row level security;
alter table public.crm_event_outbox enable row level security;

create policy crm_profiles_select_staff
on public.crm_profiles for select to authenticated
using (public.crm_is_active_staff());

create policy crm_profiles_update_admin
on public.crm_profiles for update to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

create policy crm_contacts_select_staff
on public.crm_contacts for select to authenticated
using (public.crm_is_active_staff());

create policy crm_contacts_insert_staff
on public.crm_contacts for insert to authenticated
with check (public.crm_is_active_staff());

create policy crm_contacts_update_staff
on public.crm_contacts for update to authenticated
using (public.crm_is_active_staff())
with check (public.crm_is_active_staff());

create policy crm_cases_select_staff
on public.crm_cases for select to authenticated
using (public.crm_is_active_staff());

create policy crm_cases_insert_staff
on public.crm_cases for insert to authenticated
with check (public.crm_is_active_staff());

create policy crm_cases_update_staff
on public.crm_cases for update to authenticated
using (public.crm_is_active_staff())
with check (public.crm_is_active_staff());

create policy crm_tasks_select_staff
on public.crm_tasks for select to authenticated
using (public.crm_is_active_staff());

create policy crm_tasks_insert_staff
on public.crm_tasks for insert to authenticated
with check (public.crm_is_active_staff());

create policy crm_tasks_update_staff
on public.crm_tasks for update to authenticated
using (public.crm_is_active_staff())
with check (public.crm_is_active_staff());

create policy crm_activities_select_staff
on public.crm_activities for select to authenticated
using (public.crm_is_active_staff());

create policy crm_activities_insert_staff
on public.crm_activities for insert to authenticated
with check (public.crm_is_active_staff());

create policy crm_message_templates_select_staff
on public.crm_message_templates for select to authenticated
using (public.crm_is_active_staff());

create policy crm_message_templates_insert_admin
on public.crm_message_templates for insert to authenticated
with check (public.crm_is_admin());

create policy crm_message_templates_update_admin
on public.crm_message_templates for update to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

create policy crm_notification_preferences_select_own_or_admin
on public.crm_notification_preferences for select to authenticated
using (profile_id = auth.uid() or public.crm_is_admin());

create policy crm_notification_preferences_insert_own_or_admin
on public.crm_notification_preferences for insert to authenticated
with check (profile_id = auth.uid() or public.crm_is_admin());

create policy crm_notification_preferences_update_own_or_admin
on public.crm_notification_preferences for update to authenticated
using (profile_id = auth.uid() or public.crm_is_admin())
with check (profile_id = auth.uid() or public.crm_is_admin());

create policy crm_notification_preferences_delete_own_or_admin
on public.crm_notification_preferences for delete to authenticated
using (profile_id = auth.uid() or public.crm_is_admin());

create policy crm_notifications_select_own_or_admin
on public.crm_notifications for select to authenticated
using (recipient_id = auth.uid() or public.crm_is_admin());

create policy crm_notifications_mark_own_read
on public.crm_notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy crm_notification_deliveries_select_own_or_admin
on public.crm_notification_deliveries for select to authenticated
using (
  public.crm_is_admin()
  or exists (
    select 1
    from public.crm_notifications
    where id = notification_id and recipient_id = auth.uid()
  )
);

create policy crm_event_outbox_select_admin
on public.crm_event_outbox for select to authenticated
using (public.crm_is_admin());

revoke all privileges on table public.crm_profiles from anon, authenticated;
revoke all privileges on table public.crm_contacts from anon, authenticated;
revoke all privileges on table public.crm_cases from anon, authenticated;
revoke all privileges on table public.crm_tasks from anon, authenticated;
revoke all privileges on table public.crm_activities from anon, authenticated;
revoke all privileges on table public.crm_message_templates from anon, authenticated;
revoke all privileges on table public.crm_notification_preferences from anon, authenticated;
revoke all privileges on table public.crm_notifications from anon, authenticated;
revoke all privileges on table public.crm_notification_deliveries from anon, authenticated;
revoke all privileges on table public.crm_event_outbox from anon, authenticated;

grant select on table public.crm_profiles to authenticated;
grant update (display_name, role, active, telegram_chat_id)
  on table public.crm_profiles to authenticated;

grant select on table public.crm_contacts to authenticated;
grant insert (full_name, phone_e164, email, preferred_channel, whatsapp_opt_in_at, whatsapp_opt_in_source)
  on table public.crm_contacts to authenticated;
grant update (full_name, phone_e164, email, preferred_channel, whatsapp_opt_in_at, whatsapp_opt_in_source)
  on table public.crm_contacts to authenticated;

grant select on table public.crm_cases to authenticated;
grant insert (
  contact_id,
  service,
  stage,
  waiting_on,
  owner_id,
  source,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  flight_at,
  flight_timezone,
  price_minor,
  currency,
  payment_status,
  closed_reason,
  completed_at
) on table public.crm_cases to authenticated;
grant update (
  service,
  stage,
  waiting_on,
  owner_id,
  source,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  flight_at,
  flight_timezone,
  price_minor,
  currency,
  payment_status,
  closed_reason,
  completed_at
) on table public.crm_cases to authenticated;

grant select on table public.crm_tasks to authenticated;
grant insert (case_id, assignee_id, kind, title, due_at, remind_at, priority, completed_at)
  on table public.crm_tasks to authenticated;
grant update (assignee_id, kind, title, due_at, remind_at, priority, completed_at)
  on table public.crm_tasks to authenticated;

grant select on table public.crm_activities to authenticated;
grant insert (case_id, contact_id, kind, channel, summary, metadata)
  on table public.crm_activities to authenticated;

grant select on table public.crm_message_templates to authenticated;
grant insert (key, channel, name, body, active, applicable_stages)
  on table public.crm_message_templates to authenticated;
grant update (name, body, active, applicable_stages)
  on table public.crm_message_templates to authenticated;

grant select, delete on table public.crm_notification_preferences to authenticated;
grant insert (profile_id, event, in_app, email, telegram)
  on table public.crm_notification_preferences to authenticated;
grant update (in_app, email, telegram)
  on table public.crm_notification_preferences to authenticated;

grant select on table public.crm_notifications to authenticated;
grant update (read_at) on table public.crm_notifications to authenticated;
grant select on table public.crm_notification_deliveries to authenticated;
grant select on table public.crm_event_outbox to authenticated;

grant all privileges on table public.crm_profiles to service_role;
grant all privileges on table public.crm_contacts to service_role;
grant all privileges on table public.crm_cases to service_role;
grant all privileges on table public.crm_tasks to service_role;
grant all privileges on table public.crm_activities to service_role;
grant all privileges on table public.crm_message_templates to service_role;
grant all privileges on table public.crm_notification_preferences to service_role;
grant all privileges on table public.crm_notifications to service_role;
grant all privileges on table public.crm_notification_deliveries to service_role;
grant all privileges on table public.crm_event_outbox to service_role;

create view public.crm_analytics_pipeline
with (security_invoker = true)
as
select
  stage,
  service,
  payment_status,
  currency,
  count(*)::bigint as case_count,
  count(*) filter (where payment_status = 'paid')::bigint as paid_case_count,
  coalesce(sum(price_minor) filter (where payment_status = 'paid'), 0)::bigint
    as paid_value_minor
from public.crm_cases
group by stage, service, payment_status, currency;

create view public.crm_analytics_sources
with (security_invoker = true)
as
select
  source,
  count(*)::bigint as case_count,
  count(*) filter (where stage = 'completed')::bigint as completed_count,
  count(*) filter (where stage = 'closed')::bigint as closed_count,
  round(
    100.0 * count(*) filter (where stage = 'completed') /
    nullif(count(*) filter (where stage in ('completed', 'closed')), 0),
    2
  ) as completion_rate_percent
from public.crm_cases
group by source;

create view public.crm_analytics_daily_leads
with (security_invoker = true)
as
select
  (created_at at time zone 'UTC')::date as created_date_utc,
  source,
  count(*)::bigint as case_count
from public.crm_cases
group by (created_at at time zone 'UTC')::date, source;

create view public.crm_analytics_task_health
with (security_invoker = true)
as
select
  assignee_id,
  case
    when completed_at is not null then 'completed'
    when due_at < now() then 'overdue'
    when due_at <= now() + interval '24 hours' then 'due_within_24h'
    else 'scheduled'
  end as task_state,
  count(*)::bigint as task_count
from public.crm_tasks
group by
  assignee_id,
  case
    when completed_at is not null then 'completed'
    when due_at < now() then 'overdue'
    when due_at <= now() + interval '24 hours' then 'due_within_24h'
    else 'scheduled'
  end;

create view public.crm_analytics_flight_urgency
with (security_invoker = true)
as
select
  case
    when flight_at < now() then 'passed'
    when flight_at <= now() + interval '24 hours' then 'within_24_hours'
    when flight_at <= now() + interval '72 hours' then 'within_72_hours'
    when flight_at <= now() + interval '7 days' then 'within_7_days'
    when flight_at <= now() + interval '14 days' then 'within_14_days'
    else 'later'
  end as urgency,
  count(*)::bigint as case_count
from public.crm_cases
where flight_at is not null
group by
  case
    when flight_at < now() then 'passed'
    when flight_at <= now() + interval '24 hours' then 'within_24_hours'
    when flight_at <= now() + interval '72 hours' then 'within_72_hours'
    when flight_at <= now() + interval '7 days' then 'within_7_days'
    when flight_at <= now() + interval '14 days' then 'within_14_days'
    else 'later'
  end;

create view public.crm_analytics_response_time
with (security_invoker = true)
as
select
  date_trunc('month', cases.created_at at time zone 'UTC')::date as month_utc,
  count(first_contact.first_contact_at)::bigint as contacted_case_count,
  round(
    avg(extract(epoch from (first_contact.first_contact_at - cases.created_at)) / 60.0),
    2
  ) as average_first_response_minutes
from public.crm_cases as cases
left join lateral (
  select min(activities.created_at) as first_contact_at
  from public.crm_activities as activities
  where activities.case_id = cases.id
    and activities.kind = 'contact_attempt'
) as first_contact on true
group by date_trunc('month', cases.created_at at time zone 'UTC')::date;

revoke all privileges on table public.crm_analytics_pipeline from anon, authenticated;
revoke all privileges on table public.crm_analytics_sources from anon, authenticated;
revoke all privileges on table public.crm_analytics_daily_leads from anon, authenticated;
revoke all privileges on table public.crm_analytics_task_health from anon, authenticated;
revoke all privileges on table public.crm_analytics_flight_urgency from anon, authenticated;
revoke all privileges on table public.crm_analytics_response_time from anon, authenticated;
grant select on table public.crm_analytics_pipeline to authenticated, service_role;
grant select on table public.crm_analytics_sources to authenticated, service_role;
grant select on table public.crm_analytics_daily_leads to authenticated, service_role;
grant select on table public.crm_analytics_task_health to authenticated, service_role;
grant select on table public.crm_analytics_flight_urgency to authenticated, service_role;
grant select on table public.crm_analytics_response_time to authenticated, service_role;

insert into public.crm_message_templates (key, channel, name, body, applicable_stages)
values
  (
    'first_contact',
    'whatsapp',
    'יצירת קשר ראשונית',
    'שלום {{firstName}}, כאן צוות GreekCloud. קיבלנו את פנייתך ונשמח להמשיך מכאן. מתי נוח לדבר?',
    array['new', 'contacted']::public.crm_case_stage[]
  ),
  (
    'details_reminder',
    'whatsapp',
    'תזכורת לפרטים תפעוליים',
    'שלום {{firstName}}, כדי שנוכל להמשיך בטיפול בפנייה {{caseReference}}, נשמח לקבל את הפרטים התפעוליים החסרים שסיכמנו. תודה.',
    array['collecting_details', 'waiting']::public.crm_case_stage[]
  ),
  (
    'follow_up',
    'whatsapp',
    'מעקב כללי',
    'שלום {{firstName}}, רק תזכורת ידידותית לגבי הפנייה {{caseReference}}. נשמח לדעת אם אפשר להמשיך בטיפול.',
    array['contacted', 'collecting_details', 'waiting']::public.crm_case_stage[]
  ),
  (
    'flight_approaching',
    'whatsapp',
    'מועד טיסה מתקרב',
    'שלום {{firstName}}, מועד הטיסה שסיפקת מתקרב{{flightCountdown}}. נשמח לוודא שכל הפרטים התפעוליים מתואמים.',
    array['ready', 'in_progress', 'waiting']::public.crm_case_stage[]
  ),
  (
    'completion',
    'whatsapp',
    'סיום טיפול',
    'שלום {{firstName}}, הטיפול התפעולי בפנייה {{caseReference}} הושלם. אנחנו זמינים לכל שאלה נוספת.',
    array['completed']::public.crm_case_stage[]
  )
on conflict (key) do nothing;

comment on table public.crm_contacts is
  'Operational contact details only. Do not store medical, passport, or document content.';
comment on table public.crm_cases is
  'Operational case tracking only. One contact may have multiple cases in one unified pipeline.';
comment on column public.crm_cases.flight_at is
  'Upcoming flight instant in UTC. Countdown values must be calculated at read time, never stored.';
comment on table public.crm_activities is
  'Append-only operational timeline. Free text must not contain medical, passport, or document content.';
comment on table public.crm_event_outbox is
  'Transactional notification events. Process with a server-only service role worker.';
