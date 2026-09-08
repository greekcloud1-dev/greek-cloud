"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

export function createClient() {
  const { projectUrl, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(projectUrl, publishableKey);
}
