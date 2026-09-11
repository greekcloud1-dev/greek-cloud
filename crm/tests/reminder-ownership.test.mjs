/* QA-08 — handing a case to another staff member inside the flight window left
   the urgent reminder with the person who no longer had it.

   The dedupe key named the case and the flight time but never the recipient,
   so the outbox event was already processed and the new owner got nothing,
   while the previous owner's queued email and Telegram sends stayed in the
   queue. Reproduced here against the real migrations in an in-memory
   PostgreSQL: no account, no provider, no message actually sent. */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const db = new PGlite({ extensions: { pgcrypto } });
const admin = "20000000-0000-4000-8000-000000000001";
const first = "20000000-0000-4000-8000-000000000002";
const second = "20000000-0000-4000-8000-000000000003";
let caseId;

async function asRole(role, userId, action) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}

const prepare = () =>
  asRole("service_role", null, () => db.query("select crm_prepare_notifications()"));

/* Who is queued to be emailed or messaged about this case, for this event. */
async function pendingRecipients(event) {
  const { rows } = await db.query(
    `select n.recipient_id, d.channel, d.status
       from crm_notification_deliveries d
       join crm_notifications n on n.id = d.notification_id
      where n.case_id = $1 and n.event = $2 and d.channel in ('email','telegram')
        and d.status in ('queued','failed')
      order by n.recipient_id, d.channel`,
    [caseId, event],
  );
  return rows;
}

async function inAppRecipients(event) {
  const { rows } = await db.query(
    `select distinct n.recipient_id from crm_notifications n
      where n.case_id = $1 and n.event = $2`,
    [caseId, event],
  );
  return rows.map((row) => row.recipient_id).sort();
}

before(async () => {
  await db.exec(`
    create schema auth; create schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((n) => n.endsWith(".sql")).sort()) {
    try {
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    } catch (error) {
      throw new Error(`Migration failed: ${file}: ${error.message}`);
    }
  }
  for (const [id, name] of [[admin, "admin"], [first, "first"], [second, "second"]]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${name}@example.com`]);
  }
  await db.query("update crm_profiles set role='admin',active=true where id=$1", [admin]);
  await db.query("update crm_profiles set active=true where id in ($1,$2)", [first, second]);
  // Both members want email, so a misrouted reminder is visible as a queued send.
  for (const id of [first, second, admin]) {
    await db.query(
      `insert into crm_notification_preferences(profile_id, event, in_app, email, telegram)
       select $1, unnest(enum_range(null::crm_notification_event)), true, true, false
       on conflict (profile_id, event) do update set email = true, in_app = true`,
      [id],
    );
  }

  caseId = (
    await asRole("authenticated", first, () =>
      db.query("select crm_staff_create_case('Reminder Routing','+12025550199','other') as id"),
    )
  ).rows[0].id;
});

after(async () => {
  await db.close();
});

test("a flight reminder follows the case to its new owner", async () => {
  await asRole("authenticated", admin, () =>
    db.query(
      `update crm_cases set owner_id=$1, flight_at=now()+interval '20 hours',
         flight_timezone='Asia/Jerusalem' where id=$2`,
      [first, caseId],
    ),
  );
  await prepare();

  const before = await pendingRecipients("flight_24h");
  assert.ok(before.length > 0, "the first owner is queued to be told");
  assert.ok(before.every((row) => row.recipient_id === first));

  // The handover.
  await asRole("authenticated", admin, () =>
    db.query("update crm_cases set owner_id=$1 where id=$2", [second, caseId]),
  );
  await prepare();

  const after = await pendingRecipients("flight_24h");
  assert.ok(after.length > 0, "somebody is still due to be reminded");
  assert.ok(
    after.every((row) => row.recipient_id === second),
    `only the current owner is queued; got ${JSON.stringify(after)}`,
  );

  const seen = await inAppRecipients("flight_24h");
  assert.ok(seen.includes(second), "the new owner has the reminder in the app");
});

test("the previous owner's queued sends are cancelled, not left to go out", async () => {
  const { rows } = await db.query(
    `select d.status, d.last_error from crm_notification_deliveries d
       join crm_notifications n on n.id = d.notification_id
      where n.case_id = $1 and n.event = 'flight_24h' and n.recipient_id = $2
        and d.channel in ('email','telegram')`,
    [caseId, first],
  );
  assert.ok(rows.length > 0, "the first owner did have queued sends");
  for (const row of rows) {
    assert.equal(row.status, "skipped");
    assert.equal(row.last_error, "recipient_no_longer_responsible");
  }
});

test("preparing again does not duplicate the new owner's reminder", async () => {
  const count = async () =>
    (
      await db.query(
        `select count(*)::int as n from crm_notifications
          where case_id = $1 and event = 'flight_24h' and recipient_id = $2`,
        [caseId, second],
      )
    ).rows[0].n;

  const before = await count();
  await prepare();
  assert.equal(await count(), before, "no second copy for the same owner");
});

test("a task reminder follows its assignee", async () => {
  await asRole("authenticated", admin, () =>
    db.query(
      "update crm_tasks set assignee_id=$1, due_at=now()+interval '10 minutes' where case_id=$2",
      [first, caseId],
    ),
  );
  await prepare();
  const before = await pendingRecipients("task_due");
  assert.ok(before.length > 0 && before.every((row) => row.recipient_id === first));

  await asRole("authenticated", admin, () =>
    db.query("update crm_tasks set assignee_id=$1 where case_id=$2", [second, caseId]),
  );
  await prepare();

  const after = await pendingRecipients("task_due");
  assert.ok(
    after.every((row) => row.recipient_id === second),
    `the task reminder is the new assignee's; got ${JSON.stringify(after)}`,
  );
});

test("an admin standing in for a deactivated owner keeps the reminder", async () => {
  const other = (
    await asRole("authenticated", admin, () =>
      db.query("select crm_staff_create_case('Standing In','+12025550188','other') as id"),
    )
  ).rows[0].id;

  await asRole("authenticated", admin, () =>
    db.query(
      `update crm_cases set owner_id=$1, flight_at=now()+interval '20 hours',
         flight_timezone='Asia/Jerusalem' where id=$2`,
      [second, other],
    ),
  );
  await db.query("update crm_profiles set active=false where id=$1", [second]);
  await prepare();

  const { rows } = await db.query(
    `select distinct n.recipient_id, d.status from crm_notification_deliveries d
       join crm_notifications n on n.id = d.notification_id
      where n.case_id = $1 and n.event = 'flight_24h' and d.channel = 'email'`,
    [other],
  );
  const live = rows.filter((row) => row.status === "queued" || row.status === "failed");
  assert.ok(
    live.some((row) => row.recipient_id === admin),
    `the admin fallback is still queued; got ${JSON.stringify(rows)}`,
  );

  await db.query("update crm_profiles set active=true where id=$1", [second]);
});
