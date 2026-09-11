/* The "last 7 days" window for the dashboard chart.
   ---------------------------------------------------------------------------
   Kept out of store.ts, which is server-only, so the rule that decides which
   days appear on that chart can be exercised directly: the bug this replaces
   was not in the query but in the grouping, and it was invisible until real
   rows had dates outside the week. */

const zone = "Asia/Jerusalem";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/* A full ISO date under a narrow bar is unreadable, and the year is never in
   question across seven days. */
const dayLabelFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: zone,
  day: "2-digit",
  month: "2-digit",
});

export const WEEK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyLead = { date: string; label: string; count: number };

/** The calendar day, in Israel time, that an instant falls on. */
export function dayKey(value: Date | number | string): string {
  return dayKeyFormat.format(new Date(value));
}

/**
 * Exactly seven calendar days ending today, oldest first, each carrying its
 * own count.
 *
 * Grouping whatever rows were loaded put a case from last year on a chart
 * headed "last 7 days", and left out days nobody wrote a lead on -- so a
 * quiet Tuesday read as no Tuesday at all, and the bars were neither seven
 * nor a week. Dates outside the window are ignored here rather than filtered
 * upstream, so the chart cannot drift from its own heading.
 */
export function buildWeeklyLeads(
  createdAt: Array<Date | number | string>,
  now: number = Date.now(),
): DailyLead[] {
  const counts = new Map<string, number>();
  const days: string[] = [];
  for (let back = WEEK_DAYS - 1; back >= 0; back -= 1) {
    const key = dayKey(now - back * DAY_MS);
    days.push(key);
    counts.set(key, 0);
  }

  for (const value of createdAt) {
    const key = dayKey(value);
    if (!counts.has(key)) continue;
    counts.set(key, counts.get(key)! + 1);
  }

  return days.map((date) => ({
    date,
    // Noon UTC is the same calendar day in Israel whatever the offset, so the
    // label can be derived from the key without re-deriving the instant.
    label: dayLabelFormat.format(new Date(`${date}T12:00:00Z`)),
    count: counts.get(date)!,
  }));
}
