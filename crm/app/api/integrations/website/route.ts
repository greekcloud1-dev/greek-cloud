import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRequestPhone } from "@/lib/request/schema";
import { readLimitedJson } from "@/lib/request/protection";

export const runtime = "nodejs";

// Only this allowlist may cross from the site's private intake into the CRM.
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
      },
    );
    if (error || typeof data !== "string")
      return reply(503, { error: "intake_not_confirmed" });
    return reply(200, { ok: true, caseId: data });
  } catch {
    return reply(503, { error: "intake_unavailable" });
  }
}
