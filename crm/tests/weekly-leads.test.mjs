/* QA-07 — the dashboard chart was headed "last 7 days" but grouped whatever
   case rows happened to be loaded: a case from last year appeared under that
   heading, and a day nobody wrote a lead on vanished from the chart instead
   of showing zero. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = await readFile(new URL("../lib/crm/weekly.ts", import.meta.url), "utf8");
const { buildWeeklyLeads, dayKey, WEEK_DAYS } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

/* A fixed instant, so these never depend on the day the suite runs.
   2026-09-09T09:00:00Z is 12:00 in Israel: comfortably inside the day, so
   the window is the same whichever offset is in force. */
const NOW = Date.parse("2026-09-09T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("the window is exactly seven days, oldest first", () => {
  const week = buildWeeklyLeads([], NOW);
  assert.equal(week.length, WEEK_DAYS);
  assert.deepEqual(
    week.map((day) => day.date),
    ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"],
  );
});

test("a day with no leads is a zero, not a gap", () => {
  const week = buildWeeklyLeads([NOW, NOW - 2 * DAY], NOW);
  assert.equal(week.length, WEEK_DAYS);
  assert.deepEqual(
    week.map((day) => day.count),
    [0, 0, 0, 0, 1, 0, 1],
  );
});

test("a case from outside the week never reaches the chart", () => {
  const week = buildWeeklyLeads(
    ["2025-01-02T10:00:00Z", "2026-09-08T10:00:00Z", "2026-08-01T10:00:00Z"],
    NOW,
  );
  assert.ok(!week.some((day) => day.date === "2025-01-02"), "last year is gone");
  assert.equal(week.reduce((sum, day) => sum + day.count, 0), 1, "only the in-week case counts");
  assert.equal(week.find((day) => day.date === "2026-09-08").count, 1);
});

test("a lead just past the seven-day edge is excluded, the edge day included", () => {
  const week = buildWeeklyLeads([NOW - 6 * DAY, NOW - 7 * DAY], NOW);
  assert.equal(week[0].date, "2026-09-03");
  assert.equal(week[0].count, 1, "the oldest day in the window still counts");
  assert.equal(week.reduce((sum, day) => sum + day.count, 0), 1, "the day before it does not");
});

test("days are Israel calendar days, not UTC ones", () => {
  /* 21:30 UTC on 8 September is already 00:30 on 9 September in Israel. */
  assert.equal(dayKey("2026-09-08T21:30:00Z"), "2026-09-09");
  const week = buildWeeklyLeads(["2026-09-08T21:30:00Z"], NOW);
  assert.equal(week.find((day) => day.date === "2026-09-09").count, 1);
  assert.equal(week.find((day) => day.date === "2026-09-08").count, 0);
});

test("each bar carries a short readable label, not a full ISO date", () => {
  const week = buildWeeklyLeads([], NOW);
  for (const day of week) {
    assert.match(day.label, /^\d{2}\.\d{2}$/, `${day.date} -> ${day.label}`);
  }
  assert.equal(week.at(-1).label, "09.09");
});
