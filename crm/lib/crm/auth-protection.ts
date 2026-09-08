import "server-only";
import { headers } from "next/headers";
import { consumeIntakeLimit, isSameOrigin } from "@/lib/request/protection";

/** Extra per-instance throttle; Supabase Auth limits remain required upstream. */
export async function allowAuthAttempt(
  action: "login" | "reset" | "confirm" | "password",
) {
  const incoming = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) return false;
  try {
    const request = new Request(new URL(`/crm/${action}`, origin), {
      headers: incoming,
    });
    return isSameOrigin(request) && consumeIntakeLimit(request);
  } catch {
    return false;
  }
}
