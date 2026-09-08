import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Cloud, LockKeyhole, PlaneTakeoff } from "lucide-react";
import { LoginForm } from "@/components/crm/LoginForm";
import { getCrmAuthState } from "@/lib/crm/auth";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "כניסה למערכת התפעול",
  description: "כניסה מאובטחת למערכת התפעול הפנימית של GreekCloud.",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ signedOut?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [auth, query] = await Promise.all([getCrmAuthState(), searchParams]);

  if (auth.status === "authenticated") {
    redirect("/crm");
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <div className={styles.shell}>
        <section
          className={styles.brandPanel}
          aria-labelledby="crm-welcome-title"
        >
          <Link
            className={styles.wordmark}
            href="https://www.greekcloud.co.il/"
            aria-label="GreekCloud — לדף הבית"
          >
            <span className={styles.brandMark} aria-hidden="true">
              GC
            </span>
            <span>
              <strong>GreekCloud</strong>
              <small>מרכז התפעול</small>
            </span>
          </Link>

          <div className={styles.brandCopy}>
            <p className={styles.kicker}>
              <span aria-hidden="true" />
              הכול מוכן לנסיעה
            </p>
            <h1 id="crm-welcome-title">כל לקוח. כל טיסה. במקום אחד.</h1>
            <p>
              סביבת העבודה של צוות GreekCloud למעקב מהיר, ברור ונוח — גם
              מהטלפון.
            </p>
          </div>

          <div className={styles.routeVisual} aria-hidden="true">
            <span className={styles.routeCloud}>
              <Cloud />
            </span>
            <span className={styles.routeLine} />
            <span className={styles.routeOrigin}>IL</span>
            <span className={styles.routePlane}>
              <PlaneTakeoff />
            </span>
            <span className={styles.routeDestination}>GR</span>
          </div>

          <p className={styles.privacyNote}>
            <LockKeyhole aria-hidden="true" />
            מערכת פנימית · הגישה מוגבלת לצוות מורשה
          </p>
        </section>

        <LoginForm
          isConfigured={auth.status !== "setup"}
          signedOut={query.signedOut === "1"}
        />
      </div>
    </main>
  );
}
