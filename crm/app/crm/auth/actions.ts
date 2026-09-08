"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { endLocalSession } from "@/lib/crm/session";

export async function signOutFromCrm() {
  if (isSupabaseConfigured()) {
    await endLocalSession();
  }

  redirect("/crm/login?signedOut=1");
}
