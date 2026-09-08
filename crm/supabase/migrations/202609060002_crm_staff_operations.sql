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

