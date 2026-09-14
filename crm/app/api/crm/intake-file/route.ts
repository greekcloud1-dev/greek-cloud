import { createHmac } from "node:crypto";
import { z } from "zod";
import { getCrmAuthState } from "@/lib/crm/auth";
import { createClient } from "@/lib/supabase/server";
import { readLimitedJson } from "@/lib/request/protection";

export const runtime = "nodejs";

/* Mints a short-lived link to one file of a public intake.
   ---------------------------------------------------------------------------
   The website keeps the selfie and the prescription; the CRM never holds the
   bytes. This route turns "an active staff member opened this case" into a
   link that works for a few minutes and then does not.

   The secret is shared with the website and never reaches the browser: the URL
   is built here, server-side, and only the finished URL is returned. The
   signature covers the submission id, which file, the basename and the expiry,
   so a returned link cannot be edited into a link for a different case.

   Authorisation is checked twice on purpose. First that the caller is active
   staff at all, then that the case they named really carries the file they
   asked for -- read through their own RLS-scoped client, so a staff member who
   cannot see a case cannot mint a link to its photo either. */

const LINK_TTL_MS = 5 * 60 * 1000;

const requestSchema = z
  .object({
    caseId: z.uuid(),
    file: z.enum(["selfie", "rx"]),
  })
  .strict();

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request) {
  const secret = process.env.INTAKE_FILE_SECRET;
  const base = process.env.INTAKE_FILE_ORIGIN;
  if (!secret || secret.length < 32 || !base) {
    return reply(503, { error: "not_configured" });
  }

  /* The same gate the rest of the CRM uses. "setup" means no Supabase is
     configured at all, which is a different answer from "you are not signed
     in" and worth keeping distinct. getCrmAuthState only reports
     "authenticated" for a profile that is an active admin or agent. */
  const auth = await getCrmAuthState();
  if (auth.status === "setup") return reply(503, { error: "not_configured" });
  if (auth.status !== "authenticated") return reply(401, { error: "unauthorized" });

  let payload: unknown;
  try {
    payload = await readLimitedJson(request);
  } catch {
    return reply(400, { error: "invalid_body" });
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return reply(400, { error: "invalid_request" });
  const { caseId, file } = parsed.data;

  /* Their own client, so row-level security decides what they can see. A case
     they cannot read comes back empty and they get the same answer as if the
     file did not exist. */
  const supabase = await createClient();
  const { data: receipt } = await supabase
    .from("crm_website_receipts")
    .select("submission_id")
    .eq("case_id", caseId)
    .maybeSingle();
  const { data: intake } = await supabase
    .from("crm_case_intake")
    .select("selfie_file,rx_file")
    .eq("case_id", caseId)
    .maybeSingle();

  const submissionId = receipt?.submission_id;
  const name = file === "selfie" ? intake?.selfie_file : intake?.rx_file;
  if (!submissionId || !name) return reply(404, { error: "no_file" });

  const expires = Date.now() + LINK_TTL_MS;
  const signature = createHmac("sha256", secret)
    .update([submissionId, file, name, String(expires)].join("\n"))
    .digest("hex");

  const url = new URL("/api/intake-file", base);
  url.searchParams.set("sid", submissionId);
  url.searchParams.set("f", file);
  url.searchParams.set("n", name);
  url.searchParams.set("exp", String(expires));
  url.searchParams.set("sig", signature);

  return reply(200, { url: url.toString(), expiresAt: new Date(expires).toISOString() });
}
