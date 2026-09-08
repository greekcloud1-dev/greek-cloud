"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { allowAuthAttempt } from "@/lib/crm/auth-protection";
import { getCrmUser } from "@/lib/crm/auth";
import { endLocalSession } from "@/lib/crm/session";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "יש להזין כתובת אימייל.")
    .max(320)
    .email("כתובת האימייל אינה תקינה."),
  password: z
    .string()
    .min(1, "יש להזין סיסמה.")
    .max(256, "לא ניתן לעבד את הסיסמה שהוזנה."),
});

export type LoginActionState = {
  status: "idle" | "error" | "setup";
  message?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
};

export async function signInToCrm(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (!(await allowAuthAttempt("login")))
    return {
      status: "error",
      message: "בוצעו כמה ניסיונות בזמן קצר. נסו שוב מאוחר יותר.",
    };
  if (!isSupabaseConfigured()) {
    return {
      status: "setup",
      message: "הכניסה המאובטחת עדיין לא הוגדרה בסביבה הזאת.",
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;

    return {
      status: "error",
      message: "יש לבדוק את השדות המסומנים.",
      fieldErrors: {
        email: errors.email,
        password: errors.password,
      },
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      return {
        status: "error",
        message: "לא ניתן להתחבר. בדקו את הפרטים ונסו שוב.",
      };
    }
    if (!(await getCrmUser())) {
      await endLocalSession();
      return {
        status: "error",
        message:
          "לא ניתן להתחבר. בדקו שהחשבון הוזמן והופעל על ידי מנהל המערכת.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "לא ניתן להתחבר כרגע. נסו שוב בעוד כמה רגעים.",
    };
  }

  redirect("/crm");
}
