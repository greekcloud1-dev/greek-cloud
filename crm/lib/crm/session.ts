import "server-only";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** A provider outage must never leave this browser signed in after logout. */
export async function endLocalSession(scope: "local" | "global" = "local") {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope });
    if (error) console.warn("CRM session revocation not confirmed");
  } catch {
    console.warn("CRM session revocation not confirmed");
  } finally {
    const { projectUrl } = getSupabasePublicConfig();
    const key = `sb-${new URL(projectUrl).hostname.split(".")[0]}-auth-token`;
    const jar = await cookies();
    for (const { name } of jar.getAll()) {
      if (
        name === key ||
        name.startsWith(`${key}.`) ||
        name === `${key}-code-verifier` ||
        name.startsWith(`${key}-code-verifier.`)
      ) {
        jar.set(name, "", {
          path: "/",
          maxAge: 0,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
  }
}
