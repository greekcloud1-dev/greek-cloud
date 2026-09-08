"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { endLocalSession } from "@/lib/crm/session";
import { allowAuthAttempt } from "@/lib/crm/auth-protection";

export type AccountFormState = { message: string; success?: boolean };

export async function requestPasswordReset(
  _state: AccountFormState,
  form: FormData,
): Promise<AccountFormState> {
  if (!(await allowAuthAttempt("reset")))
    return { message: "בוצעו כמה ניסיונות בזמן קצר. נסו שוב מאוחר יותר." };
  const email = z.email().max(320).safeParse(form.get("email"));
  if (!email.success) return { message: "יש להזין כתובת מייל תקינה." };
  if (!isSupabaseConfigured())
    return { message: "חיבור המשתמשים עדיין לא הוגדר." };
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${origin}/crm/account/password`,
    });
    if (error)
      return { message: "לא ניתן לשלוח קישור כרגע. נסו שוב בעוד כמה דקות." };
  } catch {
    return { message: "שירות ההתחברות אינו זמין כרגע. נסו שוב בעוד כמה דקות." };
  }
  // The success response deliberately does not disclose account existence.
  return {
    success: true,
    message:
      "אם קיים חשבון מתאים, יישלח אליו קישור לאיפוס. כדאי לבדוק גם בדואר זבל.",
  };
}

export async function acceptAccountLink(form: FormData) {
  if (!(await allowAuthAttempt("confirm")))
    redirect("/crm/account/reset?expired=1");
  const parsed = z
    .object({
      token: z.string().min(16).max(512),
      type: z.enum(["invite", "recovery"]),
    })
    .safeParse({ token: form.get("token"), type: form.get("type") });
  if (!parsed.success || !isSupabaseConfigured())
    redirect("/crm/account/reset?expired=1");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token,
    type: parsed.data.type,
  });
  if (error) redirect("/crm/account/reset?expired=1");
  redirect("/crm/account/password");
}

export async function setAccountPassword(
  _state: AccountFormState,
  form: FormData,
): Promise<AccountFormState> {
  if (!(await allowAuthAttempt("password")))
    return { message: "בוצעו כמה ניסיונות בזמן קצר. נסו שוב מאוחר יותר." };
  const parsed = z
    .object({ password: z.string().min(12).max(128), confirm: z.string() })
    .refine((value) => value.password === value.confirm)
    .safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!parsed.success)
    return {
      message: "יש לבחור סיסמה של לפחות 12 תווים ולהזין אותה שוב באופן זהה.",
    };
  if (!isSupabaseConfigured())
    return { message: "חיבור המשתמשים עדיין לא הוגדר." };
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user)
    return { message: "הקישור פג. יש לבקש קישור חדש לאיפוס." };
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error)
    return {
      message:
        "לא ניתן לשמור את הסיסמה כרגע. נסו סיסמה אחרת או בקשו קישור חדש.",
    };
  await endLocalSession("global");
  redirect("/crm/login");
}
