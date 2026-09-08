"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  setAccountPassword,
  type AccountFormState,
} from "@/app/crm/account/actions";
import styles from "@/app/crm/login/login.module.css";

export function AccountForm({
  mode,
  expired = false,
}: {
  mode: "reset" | "password";
  expired?: boolean;
}) {
  const [state, action, pending] = useActionState(
    mode === "reset" ? requestPasswordReset : setAccountPassword,
    { message: "" } as AccountFormState,
  );
  return (
    <section
      className={styles.setupPanel}
      style={{ maxWidth: 500, margin: "40px auto" }}
    >
      <h1>{mode === "reset" ? "איפוס סיסמה" : "בחירת סיסמה"}</h1>
      <p>
        {mode === "reset"
          ? "נשלח קישור לחשבון הצוות שלך."
          : "הסיסמה נשמרת בשירות ההתחברות המאובטח."}
      </p>
      {expired && (
        <p role="alert">הקישור פג או אינו תקין. אפשר לבקש קישור חדש.</p>
      )}
      <form action={action} className={styles.form}>
        {mode === "reset" ? (
          <div className={styles.fieldGroup}>
            <label htmlFor="reset-email">מייל</label>
            <div className={styles.inputShell}>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                required
              />
            </div>
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-password">סיסמה חדשה, 12 תווים לפחות</label>
              <div className={styles.inputShell}>
                <input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="confirm-password">הסיסמה שוב</label>
              <div className={styles.inputShell}>
                <input
                  id="confirm-password"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
          </>
        )}
        {state.message && (
          <p role={state.success ? "status" : "alert"}>{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={styles.primaryAction}
        >
          {pending ? "רגע…" : mode === "reset" ? "שליחת קישור" : "שמירת סיסמה"}
        </button>
      </form>
      <Link href="/crm/login">בחזרה לכניסה</Link>
    </section>
  );
}
