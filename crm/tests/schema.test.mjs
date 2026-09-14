import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Isolated, in-memory PostgreSQL. No real Supabase account or messages involved.
// These auth roles/functions are the small Supabase contract used by the schema.
const db = new PGlite({ extensions: { pgcrypto } });
const admin = "10000000-0000-4000-8000-000000000001";
const agent = "10000000-0000-4000-8000-000000000002";
const inactive = "10000000-0000-4000-8000-000000000003";
let caseId;

async function asRole(role, userId, action) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    userId ?? "",
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
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
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    } catch (error) {
      throw new Error(`Migration failed: ${file}: ${error.message}`);
    }
  }
  for (const [id, name] of [
    [admin, "admin"],
    [agent, "agent"],
    [inactive, "inactive"],
  ]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@example.com`,
    ]);
  }
  await db.query(
    "update crm_profiles set role='admin',active=true where id=$1",
    [admin],
  );
  await db.query("update crm_profiles set active=true where id=$1", [agent]);
});
after(async () => {
  await db.close();
});

test("direct staff writes cannot forge system audit events or metadata", async () => {
  const id = (
    await asRole("authenticated", agent, () =>
      db.query(
        "select crm_staff_create_case('Audit Test','+12025550120','other') as id",
      ),
    )
  ).rows[0].id;
  for (const extra of [
    "'payment_status_changed','system','{}'",
    '\'note_added\',\'system\',\'{"from":"unpaid","to":"paid"}\'',
  ]) {
    await assert.rejects(
      asRole("authenticated", agent, () =>
        db.query(
          `insert into crm_activities(case_id,contact_id,kind,channel,metadata)
       select id,contact_id,${extra}::jsonb from crm_cases where id=$1`,
          [id],
        ),
      ),
      /permission denied|row-level security/,
    );
  }
  await asRole("authenticated", agent, () =>
    db.query(
      `insert into crm_activities(case_id,contact_id,kind,channel,summary)
     select id,contact_id,'note_added','system','Allowed note' from crm_cases where id=$1`,
      [id],
    ),
  );
  await assert.rejects(
    asRole("authenticated", agent, () =>
      db.query(
        `insert into crm_activities(case_id,contact_id,kind,channel)
     select id,contact_id,'payment_status_changed','system' from crm_cases where id=$1`,
        [id],
      ),
    ),
    /row-level security/,
  );
});

test("every CRM table and view blocks anonymous and inactive record reads", async () => {
  const tables = (
    await db.query(`select tablename as name from pg_tables where schemaname='public' and tablename like 'crm_%'
    union all select viewname from pg_views where schemaname='public' and viewname like 'crm_%'`)
  ).rows;
  for (const { name } of tables) {
    await assert.rejects(
      asRole("anon", null, () => db.query(`select * from public.${name}`)),
      /permission denied/,
    );
    try {
      const data = await asRole("authenticated", inactive, () =>
        db.query(`select * from public.${name}`),
      );
      assert.equal(data.rows.length, 0, name);
    } catch (error) {
      if (!/permission denied/.test(error.message)) throw error;
    }
  }
});

test("all server-only RPCs reject authenticated and anonymous execution", async () => {
  const functions = (
    await db.query(`select p.oid::regprocedure::text as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('crm_intake_lead','crm_ingest_website_contact','crm_prepare_notifications',
      'crm_claim_notification_deliveries','crm_finish_notification_delivery')`)
  ).rows;
  assert.equal(functions.length, 5);
  for (const { signature } of functions) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,$2,'execute') as allowed",
            [role, signature],
          )
        ).rows[0].allowed,
        false,
      );
    }
  }
});

test("inactive staff RPC fails and auth metadata cannot activate or promote users", async () => {
  await assert.rejects(
    asRole("authenticated", inactive, () =>
      db.query(
        "select crm_staff_create_case('Blocked','+12025550123','other')",
      ),
    ),
    /Active staff access/,
  );
  const id = "10000000-0000-4000-8000-000000000099";
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,'untrusted@example.com','{"role":"admin","active":true}')`,
    [id],
  );
  assert.deepEqual(
    (await db.query("select role,active from crm_profiles where id=$1", [id]))
      .rows[0],
    { role: "agent", active: false },
  );
});

test("direct database assignment cannot bypass active-staff validation", async () => {
  const id = (
    await asRole("authenticated", agent, () =>
      db.query(
        "select crm_staff_create_case('Assignment Test','+12025550121','other') as id",
      ),
    )
  ).rows[0].id;
  await assert.rejects(
    asRole("authenticated", agent, () =>
      db.query("update crm_cases set owner_id=$1 where id=$2", [inactive, id]),
    ),
    /active CRM staff/,
  );
  await assert.rejects(
    asRole("authenticated", agent, () =>
      db.query("update crm_tasks set assignee_id=$1 where case_id=$2", [
        inactive,
        id,
      ]),
    ),
    /active CRM staff/,
  );
});

test("unverified public repeat cannot change existing contact email or consent", async () => {
  await asRole("authenticated", admin, () =>
    db.query(
      "select crm_staff_create_case('Known Contact','+12025550122','other')",
    ),
  );
  await asRole("service_role", null, () =>
    db.query(
      `select * from crm_intake_lead('Impersonator','+12025550122','other',
      p_email=>'attacker@example.com',p_whatsapp_opt_in=>true)`,
    ),
  );
  const saved = (
    await db.query(
      "select email,whatsapp_opt_in_at from crm_contacts where phone_e164='+12025550122'",
    )
  ).rows[0];
  assert.equal(saved.email, null);
  assert.equal(saved.whatsapp_opt_in_at, null);
});

test("new auth users are inactive until explicitly activated", async () => {
  assert.equal(
    (await db.query("select active from crm_profiles where id=$1", [inactive]))
      .rows[0].active,
    false,
  );
});

test("anonymous and inactive accounts cannot read contacts", async () => {
  await assert.rejects(
    asRole("anon", null, () => db.query("select * from crm_contacts")),
    /permission denied/,
  );
  const result = await asRole("authenticated", inactive, () =>
    db.query("select * from crm_contacts"),
  );
  assert.equal(result.rows.length, 0);
});

test("staff case creation is atomic and creates callback/audit", async () => {
  const result = await asRole("authenticated", admin, () =>
    db.query(
      "select crm_staff_create_case('Test Contact','+972500000000','other') as id",
    ),
  );
  caseId = result.rows[0].id;
  assert.ok(caseId);
  const visibleToInactive = await asRole("authenticated", inactive, () =>
    db.query("select * from crm_cases"),
  );
  assert.equal(visibleToInactive.rows.length, 0);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from crm_tasks where case_id=$1",
        [caseId],
      )
    ).rows[0].n,
    1,
  );
  assert.ok(
    (
      await db.query(
        "select count(*)::int as n from crm_activities where case_id=$1",
        [caseId],
      )
    ).rows[0].n >= 2,
  );
});

test("public RPC works and reuses a contact across multiple cases", async () => {
  const run = () =>
    asRole("service_role", null, () =>
      db.query(
        "select * from crm_intake_lead('Public Contact','+972500000001','other',p_preferred_channel=>'phone')",
      ),
    );
  const first = (await run()).rows[0];
  const second = (await run()).rows[0];
  assert.equal(first.contact_id, second.contact_id);
  assert.notEqual(first.case_id, second.case_id);
  assert.match(first.reference_no, /^GC-/);
  await assert.rejects(
    asRole("authenticated", admin, () =>
      db.query(
        "select * from crm_intake_lead('No Access','+972500000002','other')",
      ),
    ),
    /permission denied/,
  );
});

test("website bridge replay returns the same case", async () => {
  const run = () =>
    asRole("service_role", null, () =>
      db.query(
        "select crm_ingest_website_contact('test-submission-001','Website Contact','+972500000003','website@example.com','Athens','vip','2026-10-01','en') as id",
      ),
    );
  const first = (await run()).rows[0].id;
  assert.equal((await run()).rows[0].id, first);
  const saved = (
    await db.query(
      "select destination,flight_at,intake_plan,intake_arrival_on,contact_id from crm_cases where id=$1",
      [first],
    )
  ).rows[0];
  assert.equal(saved.destination, "Athens");
  assert.equal(saved.intake_plan, "vip");
  assert.equal(
    new Date(saved.intake_arrival_on).toISOString().slice(0, 10),
    "2026-10-01",
  );
  // The submitted arrival date is an estimate, not a booked flight. Writing it
  // into flight_at would start the reminder countdowns against a guess.
  assert.equal(saved.flight_at, null);
  assert.equal(
    (
      await db.query("select locale from crm_contacts where id=$1", [
        saved.contact_id,
      ])
    ).rows[0].locale,
    "en",
  );
});

test("the bridge still accepts a submission with no plan, date or language", async () => {
  const id = (
    await asRole("service_role", null, () =>
      db.query(
        "select crm_ingest_website_contact('test-submission-002','Sparse Contact','+972500000004','sparse@example.com','Crete',null,null,null) as id",
      ),
    )
  ).rows[0].id;
  const saved = (
    await db.query(
      "select destination,intake_plan,intake_arrival_on from crm_cases where id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(saved.destination, "Crete");
  assert.equal(saved.intake_plan, null);
  assert.equal(saved.intake_arrival_on, null);
});

test("the bridge refuses a plan or language it does not recognise", async () => {
  for (const [plan, locale] of [
    ["platinum", "he"],
    ["vip", "fr"],
  ]) {
    await assert.rejects(
      asRole("service_role", null, () =>
        db.query(
          "select crm_ingest_website_contact('test-submission-003','Bad Values','+972500000005','bad@example.com','Kos',$1,null,$2)",
          [plan, locale],
        ),
      ),
      /Invalid website contact/,
      `${plan}/${locale} must be refused`,
    );
  }
});

test("the full submission is stored, and the files are named but not held", async () => {
  const id = (
    await asRole("service_role", null, () =>
      db.query(
        `select crm_ingest_website_contact(
           'test-submission-005','Full Record','+972500000007','full@example.com','אתונה',
           'standard','2026-11-02','he',
           '87654321', 41::smallint, 'health narrative text', 'past',
           '{"c_health":true,"c_terms":true}'::jsonb,
           'selfie.jpg','prescription.pdf'
         ) as id`,
      ),
    )
  ).rows[0].id;

  const intake = (
    await db.query("select * from crm_case_intake where case_id=$1", [id])
  ).rows[0];
  assert.equal(intake.passport, "87654321");
  assert.equal(intake.age, 41);
  assert.equal(intake.condition, "health narrative text");
  assert.equal(intake.rx_state, "past");
  assert.deepEqual(intake.consents, { c_health: true, c_terms: true });

  // Basenames only. A storage path or URL here would mean the CRM could reach
  // the file on its own, which is the thing the signed-link design avoids.
  assert.equal(intake.selfie_file, "selfie.jpg");
  assert.equal(intake.rx_file, "prescription.pdf");
  for (const value of [intake.selfie_file, intake.rx_file]) {
    assert.ok(!value.includes("/"), "never a path");
    assert.ok(!value.startsWith("http"), "never a URL");
  }
});

test("the intake table refuses a stored value the column rules forbid", async () => {
  const caseId = (
    await db.query("select case_id from crm_website_receipts where submission_id='test-submission-005'")
  ).rows[0].case_id;
  for (const [column, value] of [
    ["selfie_file", "submissions/x/selfie.jpg"],
    ["rx_file", "https://example.com/x.pdf"],
    ["rx_state", "maybe"],
    ["age", 400],
  ]) {
    await assert.rejects(
      db.query(`update crm_case_intake set ${column}=$1 where case_id=$2`, [value, caseId]),
      /violates check constraint/,
      `${column}=${value}`,
    );
  }
});

test("staff can read the intake record but cannot rewrite what was submitted", async () => {
  const caseId = (
    await db.query("select case_id from crm_website_receipts where submission_id='test-submission-005'")
  ).rows[0].case_id;

  const visible = await asRole("authenticated", agent, () =>
    db.query("select condition from crm_case_intake where case_id=$1", [caseId]),
  );
  assert.equal(visible.rows[0].condition, "health narrative text");

  // It records what the customer wrote; a correction belongs in a case note.
  await assert.rejects(
    asRole("authenticated", agent, () =>
      db.query("update crm_case_intake set condition='rewritten' where case_id=$1", [caseId]),
    ),
    /permission denied/,
  );
  await assert.rejects(
    asRole("authenticated", agent, () =>
      db.query("delete from crm_case_intake where case_id=$1", [caseId]),
    ),
    /permission denied/,
  );
});

test("an anonymous caller cannot read a health narrative", async () => {
  // Refused at the grant, before RLS is even consulted: anon holds no
  // privilege on this table at all, which is a stronger answer than an empty
  // result and matches how every other CRM table treats anon.
  await assert.rejects(
    asRole("anon", null, () => db.query("select * from crm_case_intake")),
    /permission denied/,
  );
});

test("a site deployment predating the new fields still gets its intake in", async () => {
  // The three additions default to null, so a five-argument call from an older
  // site build records the contact rather than failing every intake.
  const id = (
    await asRole("service_role", null, () =>
      db.query(
        "select crm_ingest_website_contact('test-submission-004','Old Signature','+972500000006','old@example.com','Rhodes') as id",
      ),
    )
  ).rows[0].id;
  const saved = (
    await db.query(
      "select destination,intake_plan,intake_arrival_on from crm_cases where id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(saved.destination, "Rhodes");
  assert.equal(saved.intake_plan, null);
  assert.equal(saved.intake_arrival_on, null);
});

test("agents cannot promote themselves and audit rows cannot be edited", async () => {
  await asRole("authenticated", agent, () =>
    db.query("update crm_profiles set role='admin' where id=$1", [agent]),
  );
  assert.equal(
    (await db.query("select role from crm_profiles where id=$1", [agent]))
      .rows[0].role,
    "agent",
  );
  await assert.rejects(
    asRole("authenticated", admin, () =>
      db.query("update crm_activities set summary='tampered'"),
    ),
    /permission denied/,
  );
});

test("assignment, flight, and default task reminders queue without duplicates", async () => {
  await asRole("authenticated", admin, async () => {
    await db.query(
      "update crm_cases set owner_id=$1,flight_at=now()+interval '20 hours',flight_timezone='Asia/Jerusalem' where id=$2",
      [agent, caseId],
    );
    await db.query(
      "update crm_tasks set due_at=now()+interval '10 minutes' where case_id=$1",
      [caseId],
    );
  });
  await asRole("service_role", null, () =>
    db.query("select crm_prepare_notifications()"),
  );
  const events = (
    await db.query("select event from crm_notifications where case_id=$1", [
      caseId,
    ])
  ).rows.map((row) => row.event);
  assert.ok(events.includes("assignment"));
  assert.ok(events.includes("flight_24h"));
  assert.ok(events.includes("task_due"));
  const before = (
    await db.query("select count(*)::int as n from crm_notifications")
  ).rows[0].n;
  await asRole("service_role", null, () =>
    db.query("select crm_prepare_notifications()"),
  );
  assert.equal(
    (await db.query("select count(*)::int as n from crm_notifications")).rows[0]
      .n,
    before,
  );
});

test("delivery leases cannot be claimed twice or acknowledged with the wrong token", async () => {
  const claim = () =>
    asRole("service_role", null, () =>
      db.query(
        "select * from crm_claim_notification_deliveries(true,true,true,20)",
      ),
    );
  const first = (await claim()).rows;
  const second = (await claim()).rows;
  assert.ok(first.length > 0);
  assert.equal(
    second.filter((row) =>
      first.some((other) => row.delivery_id === other.delivery_id),
    ).length,
    0,
  );
  const delivery = first[0];
  const wrong = await asRole("service_role", null, () =>
    db.query("select crm_finish_notification_delivery($1,$2,true) as ok", [
      delivery.delivery_id,
      inactive,
    ]),
  );
  assert.equal(wrong.rows[0].ok, false);
  const correct = await asRole("service_role", null, () =>
    db.query("select crm_finish_notification_delivery($1,$2,true) as ok", [
      delivery.delivery_id,
      delivery.claim_token,
    ]),
  );
  assert.equal(correct.rows[0].ok, true);
});
