import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRequestPhone } from "@/lib/request/schema";
import { readLimitedJson } from "@/lib/request/protection";

export const runtime = "nodejs";

// The allowlist that may cross from the site's intake into the CRM. At the
// owner's decision this now includes the health description, passport and age;
// see migration 008 and CLAUDE.md.
//
// .strict() is still load-bearing: an unrecognised key is a rejected request,
// not a silently ignored one, so a field nobody decided on cannot arrive by
// accident. What must never appear here is file content or any Blob URL or
// token -- only basenames travel, and the website serves the files itself.
const websiteContactSchema = z
  .object({
    submissionId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    fullName: z.string().trim().min(1).max(160),
    phone: z
      .string()
      .max(32)
      .transform(normalizeRequestPhone)
      .refine((value) => /^\+[1-9]\d{7,14}$/.test(value)),
    email: z.email().max(320),
    destination: z.string().trim().min(1).max(120),
    plan: z.enum(["standard", "vip"]).nullish(),
    // A calendar day, not an instant: this is the arrival date the visitor
    // estimated, and it never becomes the case's flight time on its own.
    arrivalOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    locale: z.enum(["he", "en"]).nullish(),
    passport: z.string().trim().max(20).nullish(),
    age: z.number().int().min(0).max(120).nullish(),
    condition: z.string().trim().max(4000).nullish(),
    rxState: z.enum(["no", "yes", "past"]).nullish(),
    // Which boxes were ticked, as submitted. Booleans only: this is a record of
    // what was agreed to, not a place for the site to pass arbitrary structure.
    consents: z.record(z.string().max(40), z.boolean()).nullish(),
    // Basenames, never paths or URLs. The pattern is the same one the CRM
    // column enforces, so a value shaped like a path is rejected here first.
    selfieFile: z
      .string()
      .regex(/^[a-z]+\.[a-z0-9]{2,5}$/)
      .nullish(),
    rxFile: z
      .string()
      .regex(/^[a-z]+\.[a-z0-9]{2,5}$/)
      .nullish(),
  })
  .strict();

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const secret = process.env.CRM_INGEST_SECRET;
  if (!secret || secret.length < 32)
    return reply(503, { error: "not_configured" });
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return reply(401, { error: "unauthorized" });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(415, { error: "invalid_content_type" });
  let payload: unknown;
  try {
    payload = await readLimitedJson(request);
  } catch {
    return reply(400, { error: "invalid_body" });
  }
  const parsed = websiteContactSchema.safeParse(payload);
  if (!parsed.success) return reply(400, { error: "invalid_contact" });
  const contact = parsed.data;
  try {
    const { data, error } = await createAdminClient().rpc(
      "crm_ingest_website_contact",
      {
        p_submission_id: contact.submissionId,
        p_full_name: contact.fullName,
        p_phone_e164: contact.phone,
        p_email: contact.email,
        p_destination: contact.destination,
        p_plan: contact.plan ?? null,
        p_arrival_on: contact.arrivalOn ?? null,
        p_locale: contact.locale ?? null,
        p_passport: contact.passport ?? null,
        p_age: contact.age ?? null,
        p_condition: contact.condition ?? null,
        p_rx_state: contact.rxState ?? null,
        p_consents: contact.consents ?? {},
        p_selfie_file: contact.selfieFile ?? null,
        p_rx_file: contact.rxFile ?? null,
      },
    );
    if (error || typeof data !== "string")
      return reply(503, { error: "intake_not_confirmed" });
    return reply(200, { ok: true, caseId: data });
  } catch {
    return reply(503, { error: "intake_unavailable" });
  }
}
