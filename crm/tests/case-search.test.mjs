/* QA-06 — the case search matched the row UUID, which nothing on screen shows,
   and not the reference number printed on every card and notification link.
   The demo fixtures hid it by using GC-style strings for both. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../components/crm/CrmApp.tsx", import.meta.url),
  "utf8",
);

/* The filter lives inside a component that needs React and a data provider to
   run, so the searched field list is lifted out of the source and exercised on
   its own -- the bug was entirely in which fields that list names. */
const fields = source
  .match(/const matchesQuery =[\s\S]*?\n\s*\]\n/)?.[0]
  .match(/client\.\w+/g)
  ?.map((entry) => entry.replace("client.", ""));

test("the searched fields include the case number a person can actually read", () => {
  assert.ok(fields, "the search field list was found in the component");
  assert.ok(
    fields.includes("referenceNo"),
    `referenceNo must be searchable; found ${fields.join(", ")}`,
  );
});

test("searching a reference number finds its case while the UUID differs", () => {
  const clients = [
    {
      name: "לקוח בדיקה",
      phone: "0500000000",
      email: "test@example.test",
      destination: "אתונה",
      referenceNo: "GC-2609-0042",
      id: "6f1d6b0e-6a5c-4b1e-9f3a-2c8d7e5b4a10",
      service: "standard",
    },
    {
      name: "לקוח אחר",
      phone: "0500000001",
      email: "other@example.test",
      destination: "כרתים",
      referenceNo: "GC-2609-0043",
      id: "9a2c4d6e-1b3f-4a7d-8e5c-0f1a2b3c4d5e",
      service: "vip",
    },
  ];

  const matches = (client, query) =>
    fields
      .map((field) => client[field])
      .join(" ")
      .toLocaleLowerCase("he")
      .includes(query.trim().toLocaleLowerCase("he"));

  const found = clients.filter((client) => matches(client, "GC-2609-0042"));
  assert.equal(found.length, 1);
  assert.equal(found[0].referenceNo, "GC-2609-0042");

  assert.equal(clients.filter((c) => matches(c, "6f1d6b0e")).length, 1, "the UUID still matches");
  assert.equal(clients.filter((c) => matches(c, "לקוח")).length, 2, "name search is unchanged");
});
