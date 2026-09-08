import "server-only";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CrmUser = {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  role: "admin" | "agent";
};

export type CrmAuthState =
  | { status: "setup"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: CrmUser };

function readDisplayName(metadata: Record<string, unknown>, email: string) {
  const candidates = [metadata.full_name, metadata.name, metadata.display_name];
  const configuredName = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (configuredName) return configuredName.trim();
  return email.split("@")[0] || "משתמש מוזמן";
}

function getInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.at(0) ?? "")
    .join("");

  return initials || "GC";
}

/**
 * Resolves the current CRM identity without trusting cookie contents alone.
 * Missing environment variables intentionally return a distinct setup state so
 * local previews can stay usable without silently looking production-ready.
 */
export async function getCrmAuthState(): Promise<CrmAuthState> {
  if (!isSupabaseConfigured()) {
    return { status: "setup", user: null };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || typeof claimsData?.claims?.sub !== "string") {
      return { status: "anonymous", user: null };
    }

    // getUser asks Supabase Auth for the authoritative user record. Matching it
    // to the verified JWT subject prevents UI code from trusting stale claims.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.id !== claimsData.claims.sub) {
      return { status: "anonymous", user: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from("crm_profiles")
      .select("id, email, display_name, role, active")
      .eq("id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      !["admin", "agent"].includes(profile.role)
    ) {
      return { status: "anonymous", user: null };
    }

    const email = profile.email || user.email?.trim() || "משתמש מוזמן";
    const displayName =
      profile.display_name || readDisplayName(user.user_metadata, email);

    return {
      status: "authenticated",
      user: {
        id: user.id,
        email,
        displayName,
        initials: getInitials(displayName),
        role: profile.role,
      },
    };
  } catch {
    // Authentication failures should never expose the CRM or provider details.
    return { status: "anonymous", user: null };
  }
}

export async function getCrmUser() {
  const auth = await getCrmAuthState();
  return auth.status === "authenticated" ? auth.user : null;
}

/**
 * Protects a CRM server layout/page. The setup state is allowed only because the
 * current no-env preview contains demo data; configured deployments fail closed.
 */
export async function requireCrmAccess() {
  const auth = await getCrmAuthState();

  if (auth.status === "anonymous") {
    redirect("/crm/login");
  }

  return auth;
}
