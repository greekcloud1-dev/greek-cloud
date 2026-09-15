import { z } from "zod";
import { getCrmAuthState } from "@/lib/crm/auth";
import { createClient } from "@/lib/supabase/server";
import { readLimitedJson } from "@/lib/request/protection";

export const runtime = "nodejs";

/* A short-lived link to one file of a public intake.
   ---------------------------------------------------------------------------
   The files live in the same Supabase project as the case, in a private
   bucket, so this signs a path with Supabase's own signing rather than the
   hand-rolled HMAC an earlier version needed when the files sat in another
   system. Less code, and the part that has to be right is maintained by
   somebody else.

   Everything is done through the caller's own RLS-scoped client. A staff
   member who cannot read a case cannot read its intake row, so they cannot
   learn the path, so they cannot sign it -- the authorisation is the same one
   that governs the rest of the CRM rather than a second one invented here. */

const LINK_TTL_SECONDS = 300;
const BUCKET = "intake";

const requestSchema = z
  .object({ caseId: z.uuid(), file: z.enum(["selfie", "rx"]) })
  .strict();

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request) {
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

  const supabase = await createClient();
  const { data: intake } = await supabase
    .from("crm_case_intake")
    .select("selfie_path,rx_path")
    .eq("case_id", caseId)
    .maybeSingle();

  const path = file === "selfie" ? intake?.selfie_path : intake?.rx_path;
  // A case they cannot see reads as a case with no file. Same answer either
  // way, so this does not become a way to test whether a case exists.
  if (!path) return reply(404, { error: "no_file" });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, LINK_TTL_SECONDS);
  if (error || !data?.signedUrl) return reply(503, { error: "sign_failed" });

  return reply(200, {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
  });
}
