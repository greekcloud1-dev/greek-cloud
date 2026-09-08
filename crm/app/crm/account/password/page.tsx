import { redirect } from "next/navigation";
import { AccountForm } from "@/components/crm/AccountForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function PasswordPage() {
  if (!isSupabaseConfigured()) redirect("/crm/login");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/crm/account/reset?expired=1");
  return (
    <main>
      <AccountForm mode="password" />
    </main>
  );
}
