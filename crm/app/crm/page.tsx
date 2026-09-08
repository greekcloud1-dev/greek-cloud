import type { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";
import { requireCrmAccess } from "@/lib/crm/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "מרכז התפעול",
  description: "מרכז התפעול הפנימי של GreekCloud.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CrmPage() {
  const auth = await requireCrmAccess();
  return (
    <CrmApp
      demo={auth.status === "setup"}
      user={auth.user}
      integrations={{
        email: Boolean(
          process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM_EMAIL,
        ),
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        scheduled: Boolean(process.env.CRON_SECRET),
      }}
    />
  );
}
