import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { LeadRequestForm } from "@/components/request/LeadRequestForm";
import { REQUEST_SERVICES } from "@/lib/request/schema";
import styles from "./request.module.css";

export const metadata: Metadata = {
  title: "פנייה לצוות",
  description: "משאירים פרטי קשר ובוחרים איך נוח לצוות GreekCloud לחזור אליכם.",
  robots: { index: false, follow: false },
};

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (name: string, max = 240) =>
    typeof query[name] === "string" ? query[name].slice(0, max) : "";
  const requestedService = value("service");
  const service = Object.hasOwn(REQUEST_SERVICES, requestedService)
    ? (requestedService as keyof typeof REQUEST_SERVICES)
    : "medical_concierge";
  const configured =
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
    ) &&
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) &&
    Boolean(process.env.TURNSTILE_SECRET_KEY);

  return (
    <>
      <a className="skip-link" href="#request-main">
        דילוג לטופס הפנייה
      </a>
      <SiteHeader />
      <main id="request-main" className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>הצעד הבא מתחיל כאן</p>
            <h1>
              נדבר,
              <br />
              <span>ונתקדם יחד.</span>
            </h1>
            <p className={styles.lead}>
              כמה פרטים כדי שנוכל לחזור אליך בדרך שנוחה לך ולתאם את ההמשך.
            </p>
            <div className={styles.journey} aria-label="מה קורה אחרי הפנייה">
              <div>
                <span>1</span>
                <p>
                  <strong>משאירים פרטי קשר</strong>
                  <small>רק מה שצריך לשיחה הראשונה</small>
                </p>
              </div>
              <div>
                <span>2</span>
                <p>
                  <strong>בודקים לפני השליחה</strong>
                  <small>אפשר לערוך כל פרט</small>
                </p>
              </div>
              <div>
                <span>3</span>
                <p>
                  <strong>הצוות חוזר אליך</strong>
                  <small>בערוץ שבחרת, בשעות המענה</small>
                </p>
              </div>
            </div>
          </div>
          <LeadRequestForm
            service={service}
            acceptingRequests={configured}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            attribution={{
              utmSource: value("utm_source", 160),
              utmMedium: value("utm_medium", 160),
              utmCampaign: value("utm_campaign"),
              utmContent: value("utm_content"),
              utmTerm: value("utm_term"),
            }}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
