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