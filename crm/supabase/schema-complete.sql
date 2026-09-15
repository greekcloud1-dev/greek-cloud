-- ============================================================================
-- GreekCloud CRM — complete schema, as one script
-- ============================================================================
--
-- Every migration in migrations/, concatenated in filename order. Paste this
-- whole file into the Supabase SQL Editor of a NEW, EMPTY project and run it
-- once. It creates the tables, the row-level security, the transactional
-- functions, the notification queue and the private `intake` storage bucket.
--
-- This file is GENERATED. Do not edit it: change the migration it came from
-- and regenerate, or the two will disagree. On a project that already has some
-- of these migrations, apply the individual files you are missing instead --
-- running this whole script again is not safe.
--
-- What it expects to already exist, because Supabase provides them:
--   * the `auth` schema, `auth.users` and `auth.uid()`
--   * the `storage` schema with `storage.buckets` and `storage.objects`
--   * the `anon`, `authenticated` and `service_role` roles
--
-- After it runs, follow CRM-HANDOFF.md from step 3: disable public signups,
-- invite the administrator, and set that profile to role='admin', active=true.
-- Nothing works until an active staff member exists -- every incoming lead is
-- assigned to one.
-- ============================================================================


-- ==========================================================================
-- 202609040001_crm.sql
-- ==========================================================================

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

-- ==========================================================================
-- 202609060002_crm_staff_operations.sql
-- ==========================================================================

-- Authenticated staff operations. Run after the CRM foundation migration.
alter table public.crm_cases add column destination text
  check (destination is null or char_length(destination) <= 120);
grant insert (destination), update (destination) on public.crm_cases to authenticated;
alter table public.crm_cases add column first_contact_at timestamptz;
alter table public.crm_cases add column last_contact_at timestamptz;

-- Contact timestamps follow explicit recorded contact, never the act of merely
-- opening the WhatsApp or phone application.
create or replace function public.crm_record_contact_time()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'contact_attempt' then
    update public.crm_cases
    set first_contact_at = coalesce(first_contact_at, new.created_at),
        last_contact_at = greatest(coalesce(last_contact_at, new.created_at), new.created_at)
    where id = new.case_id;
  end if;
  return new;
end;
$$;
create trigger crm_activity_contact_time after insert on public.crm_activities
for each row execute function public.crm_record_contact_time();
revoke all on function public.crm_record_contact_time() from public;

update public.crm_cases as cases set
  first_contact_at = contacts.first_at,
  last_contact_at = contacts.last_at
from (
  select case_id, min(created_at) as first_at, max(created_at) as last_at
  from public.crm_activities where kind = 'contact_attempt' group by case_id
) as contacts where cases.id = contacts.case_id;

create or replace function public.crm_record_contact_edit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.full_name is distinct from new.full_name
    or old.phone_e164 is distinct from new.phone_e164
    or old.email is distinct from new.email then
    insert into public.crm_activities (case_id, contact_id, actor_id, kind, channel, summary)
    select id, new.id, auth.uid(), 'note_added', 'system', 'עודכנו פרטי איש הקשר'
    from public.crm_cases where contact_id = new.id;
  end if;
  return new;
end;
$$;
create trigger crm_contact_edit_activity after update on public.crm_contacts
for each row execute function public.crm_record_contact_edit();
revoke all on function public.crm_record_contact_edit() from public;

create or replace function public.crm_record_extra_case_changes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.destination is distinct from new.destination
    or old.waiting_on is distinct from new.waiting_on
    or old.closed_reason is distinct from new.closed_reason then
    insert into public.crm_activities (case_id, contact_id, actor_id, kind, channel, summary, metadata)
    values (new.id, new.contact_id, auth.uid(), 'note_added', 'system', 'עודכנו פרטי התיק',
      jsonb_build_object(
        'destination_changed', old.destination is distinct from new.destination,
        'waiting_on_changed', old.waiting_on is distinct from new.waiting_on,
        'closed_reason_changed', old.closed_reason is distinct from new.closed_reason
      ));
  end if;
  return new;
end;
$$;
create trigger crm_extra_case_change_activity after update on public.crm_cases
for each row execute function public.crm_record_extra_case_changes();
revoke all on function public.crm_record_extra_case_changes() from public;

create or replace function public.crm_record_task_reopened()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.completed_at is not null and new.completed_at is null then
    insert into public.crm_activities (case_id, contact_id, actor_id, kind, channel, summary, metadata)
    select new.case_id, contact_id, auth.uid(), 'note_added', 'system', 'משימה נפתחה מחדש',
      jsonb_build_object('task_id', new.id::text)
    from public.crm_cases where id = new.case_id;
  end if;
  return new;
end;
$$;
create trigger crm_task_reopened_activity after update of completed_at on public.crm_tasks
for each row execute function public.crm_record_task_reopened();
revoke all on function public.crm_record_task_reopened() from public;

-- Auth accounts are not automatically authorized CRM staff. Activate invited
-- staff explicitly in crm_profiles; never trust user-editable auth metadata.
alter table public.crm_profiles alter column active set default false;

-- Revoke a deactivated user's direct access to their notification data as well.
drop policy crm_notification_preferences_select_own_or_admin on public.crm_notification_preferences;
create policy crm_notification_preferences_select_own_or_admin on public.crm_notification_preferences
for select to authenticated using (public.crm_is_active_staff() and (profile_id = auth.uid() or public.crm_is_admin()));
drop policy crm_notification_preferences_insert_own_or_admin on public.crm_notification_preferences;
create policy crm_notification_preferences_insert_own_or_admin on public.crm_notification_preferences
for insert to authenticated with check (public.crm_is_active_staff() and (profile_id = auth.uid() or public.crm_is_admin()));
drop policy crm_notification_preferences_update_own_or_admin on public.crm_notification_preferences;
create policy crm_notification_preferences_update_own_or_admin on public.crm_notification_preferences
for update to authenticated using (public.crm_is_active_staff() and (profile_id = auth.uid() or public.crm_is_admin()))
with check (public.crm_is_active_staff() and (profile_id = auth.uid() or public.crm_is_admin()));
drop policy crm_notification_preferences_delete_own_or_admin on public.crm_notification_preferences;
create policy crm_notification_preferences_delete_own_or_admin on public.crm_notification_preferences
for delete to authenticated using (public.crm_is_active_staff() and (profile_id = auth.uid() or public.crm_is_admin()));
drop policy crm_notifications_select_own_or_admin on public.crm_notifications;
create policy crm_notifications_select_own_or_admin on public.crm_notifications
for select to authenticated using (public.crm_is_active_staff() and (recipient_id = auth.uid() or public.crm_is_admin()));
drop policy crm_notifications_mark_own_read on public.crm_notifications;
create policy crm_notifications_mark_own_read on public.crm_notifications
for update to authenticated using (public.crm_is_active_staff() and recipient_id = auth.uid())
with check (public.crm_is_active_staff() and recipient_id = auth.uid());
drop policy crm_notification_deliveries_select_own_or_admin on public.crm_notification_deliveries;
create policy crm_notification_deliveries_select_own_or_admin on public.crm_notification_deliveries
for select to authenticated using (public.crm_is_active_staff() and (
  public.crm_is_admin() or exists (select 1 from public.crm_notifications where id = notification_id and recipient_id = auth.uid())
));

create or replace function public.crm_staff_create_case(
  p_full_name text,
  p_phone_e164 text,
  p_service public.crm_service_kind,
  p_source public.crm_lead_source default 'manual',
  p_email text default null,
  p_flight_at timestamptz default null,
  p_destination text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_contact_id uuid;
  created_case_id uuid;
begin
  if not public.crm_is_active_staff() then
    raise exception 'Active staff access is required' using errcode = '42501';
  end if;
  if char_length(btrim(p_full_name)) not between 1 and 160
    or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invalid contact details' using errcode = '22023';
  end if;

  insert into public.crm_contacts (full_name, phone_e164, email)
  values (btrim(p_full_name), p_phone_e164, nullif(btrim(p_email), ''))
  on conflict (phone_e164) do nothing
  returning id into selected_contact_id;

  if selected_contact_id is null then
    select id into selected_contact_id from public.crm_contacts
    where phone_e164 = p_phone_e164;
  end if;

  insert into public.crm_cases (
    contact_id, service, source, owner_id, flight_at, flight_timezone, destination
  ) values (
    selected_contact_id, p_service, p_source, auth.uid(), p_flight_at,
    case when p_flight_at is not null then 'Asia/Jerusalem' else null end,
    nullif(btrim(p_destination), '')
  ) returning id into created_case_id;

  insert into public.crm_tasks (case_id, assignee_id, kind, title, due_at)
  values (created_case_id, auth.uid(), 'call', 'ליצור קשר ראשוני', now() + interval '2 hours');

  return created_case_id;
end;
$$;

revoke all on function public.crm_staff_create_case(
  text, text, public.crm_service_kind, public.crm_lead_source, text, timestamptz, text
) from public, anon;
grant execute on function public.crm_staff_create_case(
  text, text, public.crm_service_kind, public.crm_lead_source, text, timestamptz, text
) to authenticated;

-- ==========================================================================
-- 202609060003_crm_notifications.sql
-- ==========================================================================

-- Durable operational reminders. No customer names, phone numbers, task titles,
-- medical details or message bodies are copied into external deliveries.
alter table public.crm_notifications
  add column in_app_enabled boolean not null default true;
alter table public.crm_notification_deliveries
  add column locked_at timestamptz,
  add column lock_token uuid;

create or replace function public.crm_apply_notification_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select coalesce((select p.in_app from public.crm_notification_preferences p
    where p.profile_id = new.recipient_id and p.event = new.event), true)
  into new.in_app_enabled;
  return new;
end;
$$;
create trigger crm_notifications_apply_preference
before insert on public.crm_notifications for each row
execute function public.crm_apply_notification_preference();

create or replace function public.crm_apply_in_app_delivery_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.channel = 'in_app' and not (select n.in_app_enabled
    from public.crm_notifications n where n.id = new.notification_id) then
    new.status := 'skipped';
    new.sent_at := null;
    new.attempts := 0;
    new.last_error := 'channel_disabled';
  end if;
  return new;
end;
$$;
create trigger crm_deliveries_apply_in_app_preference
before insert on public.crm_notification_deliveries for each row
execute function public.crm_apply_in_app_delivery_preference();

create or replace function public.crm_prepare_notifications(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e record;
  c record;
  t record;
  recipient record;
  v_notification_id uuid;
  v_task_id uuid;
  v_owner_id uuid;
  event_title text;
  event_body text;
  event_severity public.crm_notification_severity;
  bucket public.crm_notification_event;
  made_flights integer := 0;
  made_tasks integer := 0;
  processed integer := 0;
  deferred integer := 0;
  made_notifications integer := 0;
  recipients integer;
begin
  -- One short transaction materializes events; provider calls happen afterwards.
  if not pg_try_advisory_xact_lock(614707130042::bigint) then
    return jsonb_build_object('busy', true, 'flight_events', 0, 'task_events', 0,
      'outbox_processed', 0, 'outbox_deferred', 0, 'notifications_created', 0);
  end if;

  insert into public.crm_event_outbox(event, aggregate_type, aggregate_id, dedupe_key, payload)
  select x.bucket, 'case', x.id,
    x.bucket::text || ':' || x.id::text || ':' || extract(epoch from x.flight_at)::text,
    jsonb_build_object('flight_epoch', extract(epoch from x.flight_at)::text)
  from (
    select cases.id, cases.flight_at, case
      when cases.flight_at <= now() + interval '24 hours' then 'flight_24h'
      when cases.flight_at <= now() + interval '72 hours' then 'flight_72h'
      when cases.flight_at <= now() + interval '7 days' then 'flight_7d'
      else 'flight_14d' end::public.crm_notification_event as bucket
    from public.crm_cases cases
    where cases.stage not in ('completed', 'closed')
      and cases.flight_at > now() and cases.flight_at <= now() + interval '14 days'
  ) x on conflict (dedupe_key) do nothing;
  get diagnostics made_flights = row_count;

  insert into public.crm_event_outbox(event, aggregate_type, aggregate_id, dedupe_key, payload)
  select case when tasks.due_at <= now() then 'task_overdue' else 'task_due' end::public.crm_notification_event,
    'task', tasks.id,
    case when tasks.due_at <= now() then 'task_overdue:' else 'task_due:' end || tasks.id::text || ':' || extract(epoch from tasks.due_at)::text,
    jsonb_build_object('due_epoch', extract(epoch from tasks.due_at)::text)
  from public.crm_tasks tasks join public.crm_cases cases on cases.id = tasks.case_id
  where tasks.completed_at is null and cases.stage not in ('completed', 'closed')
    and (tasks.due_at <= now()
      or coalesce(tasks.remind_at, tasks.due_at - interval '15 minutes') <= now())
  on conflict (dedupe_key) do nothing;
  get diagnostics made_tasks = row_count;

  -- A lost lease has an uncertain provider outcome. It needs review, never an
  -- automatic duplicate Telegram send. Definitive provider errors can retry.
  update public.crm_notification_deliveries set status = 'failed',
    last_error = 'delivery_outcome_unknown: worker lease expired; review before retry',
    next_attempt_at = null, locked_at = null, lock_token = null
  where locked_at < now() - interval '5 minutes';

  -- Respect opt-outs and disabled staff even when the delivery was queued earlier.
  update public.crm_notification_deliveries d set status = 'skipped',
    next_attempt_at = null, last_error = 'recipient_or_channel_disabled'
  from public.crm_notifications n join public.crm_profiles p on p.id = n.recipient_id
  left join public.crm_notification_preferences pref on pref.profile_id = p.id and pref.event = n.event
  where d.notification_id = n.id and d.channel in ('email', 'telegram')
    and d.status in ('queued', 'failed') and d.lock_token is null
    and (not p.active or (d.channel = 'email' and not coalesce(pref.email, false))
      or (d.channel = 'telegram' and not coalesce(pref.telegram, false)));

  -- Do not deliver old reminders if credentials are configured much later,
  -- a task is completed/rescheduled, or the flight moves to another bucket.
  update public.crm_notification_deliveries d set status = 'skipped',
    next_attempt_at = null, last_error = 'reminder_no_longer_current'
  from public.crm_notifications n join public.crm_cases cases on cases.id = n.case_id
  left join public.crm_tasks tasks on tasks.id = n.task_id
  left join public.crm_event_outbox events on events.dedupe_key = n.dedupe_key
  where d.notification_id = n.id and d.channel in ('email', 'telegram')
    and d.status in ('queued', 'failed') and d.lock_token is null and (
      cases.stage in ('completed', 'closed')
      or (n.event = 'assignment'
        and events.payload->>'owner_id' is distinct from cases.owner_id::text)
      or (n.event in ('task_due', 'task_overdue') and (
        tasks.id is null or tasks.completed_at is not null
        or events.payload->>'due_epoch' is distinct from extract(epoch from tasks.due_at)::text
        or (n.event = 'task_due' and tasks.due_at <= now())))
      or (n.event::text like 'flight_%' and (
        events.payload->>'flight_epoch' is distinct from extract(epoch from cases.flight_at)::text
        or n.event is distinct from case
          when cases.flight_at <= now() then null
          when cases.flight_at <= now() + interval '24 hours' then 'flight_24h'
          when cases.flight_at <= now() + interval '72 hours' then 'flight_72h'
          when cases.flight_at <= now() + interval '7 days' then 'flight_7d'
          when cases.flight_at <= now() + interval '14 days' then 'flight_14d'
          else null end::public.crm_notification_event))
    );

  for e in select * from public.crm_event_outbox
    where status in ('queued', 'failed') and available_at <= now() and attempts < 5
    order by available_at, created_at limit greatest(1, least(p_limit, 500))
    for update skip locked
  loop
    v_task_id := null;
    v_owner_id := null;
    if e.aggregate_type = 'task' then
      select * into t from public.crm_tasks where id = e.aggregate_id;
      if not found or t.completed_at is not null
        or e.payload->>'due_epoch' is distinct from extract(epoch from t.due_at)::text
        or (e.event = 'task_due' and t.due_at <= now()) then
        update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'event_no_longer_current' where id = e.id;
        processed := processed + 1;
        continue;
      end if;
      v_task_id := t.id;
      v_owner_id := t.assignee_id;
      select * into c from public.crm_cases where id = t.case_id;
    elsif e.aggregate_type = 'case' then
      select * into c from public.crm_cases where id = e.aggregate_id;
    else
      update public.crm_event_outbox set status = 'failed', attempts = 5,
        last_error = 'unsupported_notification_event' where id = e.id;
      continue;
    end if;
    if not found or c.stage in ('completed', 'closed') then
      update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'case_no_longer_active' where id = e.id;
      processed := processed + 1;
      continue;
    end if;
    v_owner_id := coalesce(v_owner_id, c.owner_id);
    if e.event = 'assignment'
      and e.payload->>'owner_id' is distinct from c.owner_id::text then
      update public.crm_event_outbox set status = 'processed', processed_at = now(),
        last_error = 'assignment_no_longer_current' where id = e.id;
      processed := processed + 1;
      continue;
    end if;
    if e.event::text like 'flight_%' then
      bucket := case
        when c.flight_at <= now() then null
        when c.flight_at <= now() + interval '24 hours' then 'flight_24h'
        when c.flight_at <= now() + interval '72 hours' then 'flight_72h'
        when c.flight_at <= now() + interval '7 days' then 'flight_7d'
        when c.flight_at <= now() + interval '14 days' then 'flight_14d'
        else null end;
      if bucket is distinct from e.event
        or e.payload->>'flight_epoch' is distinct from extract(epoch from c.flight_at)::text then
        update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'flight_no_longer_current' where id = e.id;
        processed := processed + 1;
        continue;
      end if;
    end if;
    event_title := case e.event
      when 'new_case' then 'פנייה חדשה לטיפול'
      when 'assignment' then 'תיק הועבר לטיפולך'
      when 'task_due' then 'תזכורת למשימה'
      when 'task_overdue' then 'משימה באיחור'
      when 'flight_14d' then 'הטיסה בתוך שבועיים'
      when 'flight_7d' then 'הטיסה בתוך שבוע'
      when 'flight_72h' then 'הטיסה בתוך 72 שעות'
      when 'flight_24h' then 'הטיסה בתוך 24 שעות'
      else null end;
    if event_title is null then
      update public.crm_event_outbox set status = 'failed', attempts = 5,
        last_error = 'unsupported_notification_event' where id = e.id;
      continue;
    end if;
    event_body := 'תיק ' || c.reference_no || ' ממתין לעדכון. אפשר לפתוח את התיק ולבדוק את הפעולה הבאה.';
    event_severity := case when e.event in ('flight_24h', 'task_overdue') then 'urgent'
      when e.event in ('flight_72h', 'flight_7d', 'task_due') then 'warning' else 'info' end;
    recipients := 0;
    for recipient in
      select p.id, coalesce(pref.in_app, true) as in_app,
        coalesce(pref.email, false) as email, coalesce(pref.telegram, false) as telegram
      from public.crm_profiles p left join public.crm_notification_preferences pref
        on pref.profile_id = p.id and pref.event = e.event
      where p.active and (p.id = v_owner_id or (p.role = 'admin' and not exists (
        select 1 from public.crm_profiles owner where owner.id = v_owner_id and owner.active)))
    loop
      recipients := recipients + 1;
      insert into public.crm_notifications(dedupe_key, recipient_id, event, case_id, task_id, severity, title, body, action_href, in_app_enabled)
      values(e.dedupe_key, recipient.id, e.event, c.id, v_task_id, event_severity, event_title,
        event_body, '/crm/?case=' || c.id::text, recipient.in_app)
      on conflict (recipient_id, dedupe_key) do nothing returning id into v_notification_id;
      if v_notification_id is null then
        select id into v_notification_id from public.crm_notifications
        where recipient_id = recipient.id and dedupe_key = e.dedupe_key;
        update public.crm_notifications set in_app_enabled = recipient.in_app
          where id = v_notification_id;
      else
        made_notifications := made_notifications + 1;
      end if;
      insert into public.crm_notification_deliveries(notification_id, channel, status, attempts, sent_at)
      select v_notification_id, x.channel, case when x.channel = 'in_app' then 'sent' else 'queued' end::public.crm_delivery_status,
        case when x.channel = 'in_app' then 1 else 0 end, case when x.channel = 'in_app' then now() else null end
      from (values ('in_app'::public.crm_notification_channel, recipient.in_app),
        ('email'::public.crm_notification_channel, recipient.email),
        ('telegram'::public.crm_notification_channel, recipient.telegram)) x(channel, enabled)
      where x.enabled on conflict (notification_id, channel) do nothing;
    end loop;
    if recipients = 0 then
      update public.crm_event_outbox set available_at = now() + interval '5 minutes',
        last_error = 'no_active_recipient' where id = e.id;
      deferred := deferred + 1;
    else
      update public.crm_event_outbox set status = 'processed', processed_at = now(),
        attempts = attempts + 1, last_error = null where id = e.id;
      processed := processed + 1;
    end if;
  end loop;
  return jsonb_build_object('busy', false, 'flight_events', made_flights, 'task_events', made_tasks,
    'outbox_processed', processed, 'outbox_deferred', deferred, 'notifications_created', made_notifications);
end;
$$;

create or replace function public.crm_claim_notification_deliveries(
  p_email_ready boolean, p_telegram_ready boolean, p_telegram_fallback boolean,
  p_limit integer default 10
)
returns table(delivery_id uuid, claim_token uuid, channel public.crm_notification_channel,
  attempts integer, recipient_email text, telegram_chat_id text, reference_no text, case_id uuid)
language sql security definer set search_path = '' as $$
  with candidates as (
    select d.id from public.crm_notification_deliveries d
    join public.crm_notifications n on n.id = d.notification_id
    join public.crm_profiles p on p.id = n.recipient_id
    join public.crm_notification_preferences pref on pref.profile_id = p.id and pref.event = n.event
    where d.status in ('queued', 'failed') and d.attempts < 5 and d.lock_token is null
      and (d.status = 'queued' or d.next_attempt_at is not null)
      and coalesce(d.next_attempt_at, now()) <= now() and p.active
      and ((d.channel = 'email' and p_email_ready and pref.email)
        or (d.channel = 'telegram' and p_telegram_ready and pref.telegram
          and (nullif(btrim(p.telegram_chat_id), '') is not null or p_telegram_fallback)))
    order by d.created_at limit greatest(1, least(p_limit, 20))
    for update of d skip locked
  ), claimed as (
    update public.crm_notification_deliveries d set locked_at = now(), lock_token = gen_random_uuid(),
      attempts = d.attempts + 1 from candidates q where d.id = q.id
    returning d.*
  )
  select d.id, d.lock_token, d.channel, d.attempts, p.email, p.telegram_chat_id, c.reference_no, n.case_id
  from claimed d join public.crm_notifications n on n.id = d.notification_id
  join public.crm_profiles p on p.id = n.recipient_id
  left join public.crm_cases c on c.id = n.case_id;
$$;

create or replace function public.crm_finish_notification_delivery(
  p_delivery_id uuid, p_claim_token uuid, p_ok boolean,
  p_provider_message_id text default null, p_error_code text default null,
  p_retryable boolean default false, p_retry_after_seconds integer default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.crm_notification_deliveries set
    status = case when p_ok then 'sent' else 'failed' end::public.crm_delivery_status,
    provider_message_id = left(p_provider_message_id, 240),
    sent_at = case when p_ok then now() else null end,
    next_attempt_at = case when not p_ok and p_retryable and attempts < 5
      then now() + make_interval(secs => greatest(60 * power(2, attempts)::integer,
        least(coalesce(p_retry_after_seconds, 0), 21600))) else null end,
    last_error = case when p_ok then null else left(coalesce(p_error_code, 'provider_error'), 1000) end,
    lock_token = null, locked_at = null
  where id = p_delivery_id and lock_token = p_claim_token;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.crm_apply_notification_preference() from public, anon, authenticated;
revoke all on function public.crm_apply_in_app_delivery_preference() from public, anon, authenticated;
revoke all on function public.crm_prepare_notifications(integer) from public, anon, authenticated;
revoke all on function public.crm_claim_notification_deliveries(boolean, boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.crm_finish_notification_delivery(uuid, uuid, boolean, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.crm_prepare_notifications(integer) to service_role;
grant execute on function public.crm_claim_notification_deliveries(boolean, boolean, boolean, integer) to service_role;
grant execute on function public.crm_finish_notification_delivery(uuid, uuid, boolean, text, text, boolean, integer) to service_role;

-- ==========================================================================
-- 202609070004_website_bridge.sql
-- ==========================================================================

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

-- ==========================================================================
-- 202609080005_security_hardening.sql
-- ==========================================================================

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

-- ==========================================================================
-- 202609110006_reminder_ownership.sql
-- ==========================================================================

-- Route reminders to whoever holds the case now.
--
-- A flight or task reminder was keyed by the case and the flight time alone,
-- never by the person it was for. Reassigning a case inside the flight window
-- therefore did nothing: the outbox event was already processed, so the new
-- owner got no flight reminder, while the previous owner's queued email and
-- Telegram sends stayed in the queue and went out. Reproduced against these
-- migrations: a case 20 hours from departure, handed from one active member to
-- another, left flight_24h sitting with the first.
--
-- Three changes, all inside crm_prepare_notifications:
--   * the dedupe key names the responsible person, so a handover produces a
--     fresh event for the new one instead of colliding with a processed row;
--   * unsent email/Telegram deliveries addressed to someone who is no longer
--     responsible are skipped as 'recipient_no_longer_responsible';
--   * a flight event whose owner has since changed is retired rather than
--     fanned out again.
--
-- An admin standing in for an owner who is no longer active keeps receiving
-- the reminder: that fallback is the existing recipient rule, not a stale
-- address. Anything already sent stays sent; this only governs the queue.
--
-- In-app notifications are unaffected: they are written at fan-out time and
-- the new owner's arrive through the new event.

create or replace function public.crm_prepare_notifications(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e record;
  c record;
  t record;
  recipient record;
  v_notification_id uuid;
  v_task_id uuid;
  v_owner_id uuid;
  event_title text;
  event_body text;
  event_severity public.crm_notification_severity;
  bucket public.crm_notification_event;
  made_flights integer := 0;
  made_tasks integer := 0;
  processed integer := 0;
  deferred integer := 0;
  made_notifications integer := 0;
  recipients integer;
begin
  -- One short transaction materializes events; provider calls happen afterwards.
  if not pg_try_advisory_xact_lock(614707130042::bigint) then
    return jsonb_build_object('busy', true, 'flight_events', 0, 'task_events', 0,
      'outbox_processed', 0, 'outbox_deferred', 0, 'notifications_created', 0);
  end if;

  -- The key names the person the reminder is for, not just the case and the
  -- flight. Without that, handing a case to someone else inside the flight
  -- window left the event already processed: the new owner was never told, and
  -- the previous owner's queued sends went out anyway.
  insert into public.crm_event_outbox(event, aggregate_type, aggregate_id, dedupe_key, payload)
  select x.bucket, 'case', x.id,
    x.bucket::text || ':' || x.id::text || ':' || extract(epoch from x.flight_at)::text
      || ':' || coalesce(x.owner_id::text, 'unassigned'),
    jsonb_build_object('flight_epoch', extract(epoch from x.flight_at)::text,
      'owner_id', x.owner_id::text)
  from (
    select cases.id, cases.flight_at, cases.owner_id, case
      when cases.flight_at <= now() + interval '24 hours' then 'flight_24h'
      when cases.flight_at <= now() + interval '72 hours' then 'flight_72h'
      when cases.flight_at <= now() + interval '7 days' then 'flight_7d'
      else 'flight_14d' end::public.crm_notification_event as bucket
    from public.crm_cases cases
    where cases.stage not in ('completed', 'closed')
      and cases.flight_at > now() and cases.flight_at <= now() + interval '14 days'
  ) x on conflict (dedupe_key) do nothing;
  get diagnostics made_flights = row_count;

  insert into public.crm_event_outbox(event, aggregate_type, aggregate_id, dedupe_key, payload)
  select case when tasks.due_at <= now() then 'task_overdue' else 'task_due' end::public.crm_notification_event,
    'task', tasks.id,
    case when tasks.due_at <= now() then 'task_overdue:' else 'task_due:' end || tasks.id::text
      || ':' || extract(epoch from tasks.due_at)::text
      || ':' || coalesce(tasks.assignee_id::text, cases.owner_id::text, 'unassigned'),
    jsonb_build_object('due_epoch', extract(epoch from tasks.due_at)::text,
      'owner_id', coalesce(tasks.assignee_id, cases.owner_id)::text)
  from public.crm_tasks tasks join public.crm_cases cases on cases.id = tasks.case_id
  where tasks.completed_at is null and cases.stage not in ('completed', 'closed')
    and (tasks.due_at <= now()
      or coalesce(tasks.remind_at, tasks.due_at - interval '15 minutes') <= now())
  on conflict (dedupe_key) do nothing;
  get diagnostics made_tasks = row_count;

  -- A lost lease has an uncertain provider outcome. It needs review, never an
  -- automatic duplicate Telegram send. Definitive provider errors can retry.
  update public.crm_notification_deliveries set status = 'failed',
    last_error = 'delivery_outcome_unknown: worker lease expired; review before retry',
    next_attempt_at = null, locked_at = null, lock_token = null
  where locked_at < now() - interval '5 minutes';

  -- Respect opt-outs and disabled staff even when the delivery was queued earlier.
  update public.crm_notification_deliveries d set status = 'skipped',
    next_attempt_at = null, last_error = 'recipient_or_channel_disabled'
  from public.crm_notifications n join public.crm_profiles p on p.id = n.recipient_id
  left join public.crm_notification_preferences pref on pref.profile_id = p.id and pref.event = n.event
  where d.notification_id = n.id and d.channel in ('email', 'telegram')
    and d.status in ('queued', 'failed') and d.lock_token is null
    and (not p.active or (d.channel = 'email' and not coalesce(pref.email, false))
      or (d.channel = 'telegram' and not coalesce(pref.telegram, false)));

  -- A reminder belongs to whoever holds the case now. The staleness sweep
  -- below only ever compared ownership for 'assignment' events, so after a
  -- handover the previous owner's queued email and Telegram sends for a flight
  -- or a task stayed in the queue and went out. An admin standing in for an
  -- owner who is no longer active is still the right person to tell, so that
  -- case is left alone. An unassigned case has no wrong recipient to cancel.
  update public.crm_notification_deliveries d set status = 'skipped',
    next_attempt_at = null, last_error = 'recipient_no_longer_responsible'
  from public.crm_notifications n
  join public.crm_cases cases on cases.id = n.case_id
  left join public.crm_tasks tasks on tasks.id = n.task_id
  where d.notification_id = n.id and d.channel in ('email', 'telegram')
    and d.status in ('queued', 'failed') and d.lock_token is null
    and n.event not in ('new_case', 'assignment')
    and coalesce(tasks.assignee_id, cases.owner_id) is not null
    and n.recipient_id is distinct from coalesce(tasks.assignee_id, cases.owner_id)
    and not (
      exists (select 1 from public.crm_profiles admin
        where admin.id = n.recipient_id and admin.role = 'admin' and admin.active)
      and not exists (select 1 from public.crm_profiles owner
        where owner.id = coalesce(tasks.assignee_id, cases.owner_id) and owner.active)
    );

  -- Do not deliver old reminders if credentials are configured much later,
  -- a task is completed/rescheduled, or the flight moves to another bucket.
  update public.crm_notification_deliveries d set status = 'skipped',
    next_attempt_at = null, last_error = 'reminder_no_longer_current'
  from public.crm_notifications n join public.crm_cases cases on cases.id = n.case_id
  left join public.crm_tasks tasks on tasks.id = n.task_id
  left join public.crm_event_outbox events on events.dedupe_key = n.dedupe_key
  where d.notification_id = n.id and d.channel in ('email', 'telegram')
    and d.status in ('queued', 'failed') and d.lock_token is null and (
      cases.stage in ('completed', 'closed')
      or (n.event = 'assignment'
        and events.payload->>'owner_id' is distinct from cases.owner_id::text)
      or (n.event in ('task_due', 'task_overdue') and (
        tasks.id is null or tasks.completed_at is not null
        or events.payload->>'due_epoch' is distinct from extract(epoch from tasks.due_at)::text
        or (n.event = 'task_due' and tasks.due_at <= now())))
      or (n.event::text like 'flight_%' and (
        events.payload->>'flight_epoch' is distinct from extract(epoch from cases.flight_at)::text
        or n.event is distinct from case
          when cases.flight_at <= now() then null
          when cases.flight_at <= now() + interval '24 hours' then 'flight_24h'
          when cases.flight_at <= now() + interval '72 hours' then 'flight_72h'
          when cases.flight_at <= now() + interval '7 days' then 'flight_7d'
          when cases.flight_at <= now() + interval '14 days' then 'flight_14d'
          else null end::public.crm_notification_event))
    );

  for e in select * from public.crm_event_outbox
    where status in ('queued', 'failed') and available_at <= now() and attempts < 5
    order by available_at, created_at limit greatest(1, least(p_limit, 500))
    for update skip locked
  loop
    v_task_id := null;
    v_owner_id := null;
    if e.aggregate_type = 'task' then
      select * into t from public.crm_tasks where id = e.aggregate_id;
      if not found or t.completed_at is not null
        or e.payload->>'due_epoch' is distinct from extract(epoch from t.due_at)::text
        or (e.event = 'task_due' and t.due_at <= now()) then
        update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'event_no_longer_current' where id = e.id;
        processed := processed + 1;
        continue;
      end if;
      v_task_id := t.id;
      v_owner_id := t.assignee_id;
      select * into c from public.crm_cases where id = t.case_id;
    elsif e.aggregate_type = 'case' then
      select * into c from public.crm_cases where id = e.aggregate_id;
    else
      update public.crm_event_outbox set status = 'failed', attempts = 5,
        last_error = 'unsupported_notification_event' where id = e.id;
      continue;
    end if;
    if not found or c.stage in ('completed', 'closed') then
      update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'case_no_longer_active' where id = e.id;
      processed := processed + 1;
      continue;
    end if;
    v_owner_id := coalesce(v_owner_id, c.owner_id);
    if e.event = 'assignment'
      and e.payload->>'owner_id' is distinct from c.owner_id::text then
      update public.crm_event_outbox set status = 'processed', processed_at = now(),
        last_error = 'assignment_no_longer_current' where id = e.id;
      processed := processed + 1;
      continue;
    end if;
    if e.event::text like 'flight_%'
      and e.payload->>'owner_id' is distinct from c.owner_id::text then
      update public.crm_event_outbox set status = 'processed', processed_at = now(),
        last_error = 'owner_no_longer_current' where id = e.id;
      processed := processed + 1;
      continue;
    end if;
    if e.event::text like 'flight_%' then
      bucket := case
        when c.flight_at <= now() then null
        when c.flight_at <= now() + interval '24 hours' then 'flight_24h'
        when c.flight_at <= now() + interval '72 hours' then 'flight_72h'
        when c.flight_at <= now() + interval '7 days' then 'flight_7d'
        when c.flight_at <= now() + interval '14 days' then 'flight_14d'
        else null end;
      if bucket is distinct from e.event
        or e.payload->>'flight_epoch' is distinct from extract(epoch from c.flight_at)::text then
        update public.crm_event_outbox set status = 'processed', processed_at = now(), last_error = 'flight_no_longer_current' where id = e.id;
        processed := processed + 1;
        continue;
      end if;
    end if;
    event_title := case e.event
      when 'new_case' then 'פנייה חדשה לטיפול'
      when 'assignment' then 'תיק הועבר לטיפולך'
      when 'task_due' then 'תזכורת למשימה'
      when 'task_overdue' then 'משימה באיחור'
      when 'flight_14d' then 'הטיסה בתוך שבועיים'
      when 'flight_7d' then 'הטיסה בתוך שבוע'
      when 'flight_72h' then 'הטיסה בתוך 72 שעות'
      when 'flight_24h' then 'הטיסה בתוך 24 שעות'
      else null end;
    if event_title is null then
      update public.crm_event_outbox set status = 'failed', attempts = 5,
        last_error = 'unsupported_notification_event' where id = e.id;
      continue;
    end if;
    event_body := 'תיק ' || c.reference_no || ' ממתין לעדכון. אפשר לפתוח את התיק ולבדוק את הפעולה הבאה.';
    event_severity := case when e.event in ('flight_24h', 'task_overdue') then 'urgent'
      when e.event in ('flight_72h', 'flight_7d', 'task_due') then 'warning' else 'info' end;
    recipients := 0;
    for recipient in
      select p.id, coalesce(pref.in_app, true) as in_app,
        coalesce(pref.email, false) as email, coalesce(pref.telegram, false) as telegram
      from public.crm_profiles p left join public.crm_notification_preferences pref
        on pref.profile_id = p.id and pref.event = e.event
      where p.active and (p.id = v_owner_id or (p.role = 'admin' and not exists (
        select 1 from public.crm_profiles owner where owner.id = v_owner_id and owner.active)))
    loop
      recipients := recipients + 1;
      insert into public.crm_notifications(dedupe_key, recipient_id, event, case_id, task_id, severity, title, body, action_href, in_app_enabled)
      values(e.dedupe_key, recipient.id, e.event, c.id, v_task_id, event_severity, event_title,
        event_body, '/crm/?case=' || c.id::text, recipient.in_app)
      on conflict (recipient_id, dedupe_key) do nothing returning id into v_notification_id;
      if v_notification_id is null then
        select id into v_notification_id from public.crm_notifications
        where recipient_id = recipient.id and dedupe_key = e.dedupe_key;
        update public.crm_notifications set in_app_enabled = recipient.in_app
          where id = v_notification_id;
      else
        made_notifications := made_notifications + 1;
      end if;
      insert into public.crm_notification_deliveries(notification_id, channel, status, attempts, sent_at)
      select v_notification_id, x.channel, case when x.channel = 'in_app' then 'sent' else 'queued' end::public.crm_delivery_status,
        case when x.channel = 'in_app' then 1 else 0 end, case when x.channel = 'in_app' then now() else null end
      from (values ('in_app'::public.crm_notification_channel, recipient.in_app),
        ('email'::public.crm_notification_channel, recipient.email),
        ('telegram'::public.crm_notification_channel, recipient.telegram)) x(channel, enabled)
      where x.enabled on conflict (notification_id, channel) do nothing;
    end loop;
    if recipients = 0 then
      update public.crm_event_outbox set available_at = now() + interval '5 minutes',
        last_error = 'no_active_recipient' where id = e.id;
      deferred := deferred + 1;
    else
      update public.crm_event_outbox set status = 'processed', processed_at = now(),
        attempts = attempts + 1, last_error = null where id = e.id;
      processed := processed + 1;
    end if;
  end loop;
  return jsonb_build_object('busy', false, 'flight_events', made_flights, 'task_events', made_tasks,
    'outbox_processed', processed, 'outbox_deferred', deferred, 'notifications_created', made_notifications);
end;
$$;

-- ==========================================================================
-- 202609140007_website_bridge_operational_fields.sql
-- ==========================================================================

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

-- ==========================================================================
-- 202609140008_intake_full_record.sql
-- ==========================================================================

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

-- ==========================================================================
-- 202609150009_intake_storage.sql
-- ==========================================================================

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
