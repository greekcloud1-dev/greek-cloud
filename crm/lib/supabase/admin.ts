import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!projectUrl || !secretKey) {
    throw new Error(
      "Supabase admin access is not configured. Keep SUPABASE_SECRET_KEY server-only.",
    );
  }

  return createClient(projectUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
