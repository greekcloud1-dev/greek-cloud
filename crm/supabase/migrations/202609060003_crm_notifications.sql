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

