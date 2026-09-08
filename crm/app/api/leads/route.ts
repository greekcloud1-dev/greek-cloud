import { createAdminClient } from "@/lib/supabase/admin";
import { flightDateTimeToIso, leadRequestSchema } from "@/lib/request/schema";
import {
  consumeIntakeLimit,
  isSameOrigin,
  readLimitedJson,
  verifyTurnstile,
} from "@/lib/request/protection";

export const runtime = "nodejs";

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return reply({ error: "צריך לשלוח את הפנייה מתוך הטופס באתר." }, 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return reply({ error: "פורמט הפנייה אינו נתמך." }, 415);
  }
  if (!consumeIntakeLimit(request)) {
    return reply(
      { error: "נשלחו כמה פניות בזמן קצר. אפשר לנסות שוב בעוד מספר דקות." },
      429,
    );
  }

  let payload: unknown;
  try {
    payload = await readLimitedJson(request);
  } catch (error) {
    return reply(
      { error: "לא ניתן לקרוא את הפנייה. כדאי לרענן את העמוד ולנסות שוב." },
      error instanceof Error && error.message === "body_too_large" ? 413 : 400,
    );
  }
  const parsed = leadRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((issue) => [
        String(issue.path[0] ?? "form"),
        issue.message,
      ]),
    );
    return reply({ error: "יש פרטים שצריך לבדוק לפני השליחה.", fields }, 400);
  }
  const lead = parsed.data;
  if (lead.website)
    return reply({ error: "לא ניתן לשלוח את הפנייה הזו." }, 400);

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    !process.env.TURNSTILE_SECRET_KEY
  ) {
    return reply(
      {
        error:
          "שליחת פניות עדיין אינה זמינה. הפרטים לא נשמרו. אפשר לנסות שוב מאוחר יותר.",
      },
      503,
    );
  }

  try {
    if (!(await verifyTurnstile(lead.turnstileToken, request))) {
      return reply(
        {
          error: "האימות פג או לא הושלם. צריך להשלים את האימות ולנסות שוב.",
          resetVerification: true,
        },
        400,
      );
    }
  } catch {
    return reply(
      {
        error: "שירות האימות לא זמין כרגע. אפשר לנסות שוב בעוד רגע.",
        resetVerification: true,
      },
      503,
    );
  }

  try {
    const { data, error } = await createAdminClient().rpc("crm_intake_lead", {
      p_full_name: lead.fullName,
      p_phone_e164: lead.phone,
      p_email: lead.email || null,
      p_service: lead.service,
      p_source: "website",
      p_preferred_channel: lead.preferredChannel,
      p_whatsapp_opt_in:
        lead.preferredChannel === "whatsapp" && lead.contactConsent,
      p_flight_at: lead.flightLocal
        ? flightDateTimeToIso(lead.flightLocal, lead.flightTimezone)
        : null,
      p_flight_timezone: lead.flightLocal ? lead.flightTimezone : null,
      p_utm_source: lead.utmSource || null,
      p_utm_medium: lead.utmMedium || null,
      p_utm_campaign: lead.utmCampaign || null,
      p_utm_content: lead.utmContent || null,
      p_utm_term: lead.utmTerm || null,
    });
    if (error || !Array.isArray(data) || !data[0]?.reference_no) {
      console.error("Public intake failed", {
        code: error?.code ?? "empty_result",
      });
      return reply(
        {
          error: "הפנייה לא נשמרה. אפשר לנסות שוב מאוחר יותר.",
          resetVerification: true,
        },
        503,
      );
    }
    return reply({ reference: data[0].reference_no }, 201);
  } catch {
    return reply(
      {
        error: "לא התקבל אישור על שמירת הפנייה. אפשר לנסות שוב מאוחר יותר.",
        resetVerification: true,
      },
      503,
    );
  }
}
