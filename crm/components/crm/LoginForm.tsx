"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { signInToCrm, type LoginActionState } from "@/app/crm/login/actions";
import styles from "@/app/crm/login/login.module.css";

const initialState: LoginActionState = { status: "idle" };

type LoginFormProps = {
  isConfigured: boolean;
  signedOut?: boolean;
};

export function LoginForm({ isConfigured, signedOut = false }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    signInToCrm,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  if (!isConfigured) {
    return (
      <section className={styles.setupPanel} aria-labelledby="setup-title">
        <span className={styles.setupIcon} aria-hidden="true">
          <ShieldCheck />
        </span>
        <p className={styles.formEyebrow}>סביבת תצוגה</p>
        <h2 id="setup-title">מצב הדגמה פעיל</h2>
        <p>
          חיבור המשתמשים עדיין לא הושלם. אפשר להתרשם מהמערכת עם נתוני הדגמה
          בלבד; מידע אמיתי לא אמור להישמר במצב הזה.
        </p>
        <Link className={styles.primaryAction} href="/crm">
          כניסה להדגמה
          <ArrowLeft aria-hidden="true" />
        </Link>
        <small>
          לפני שימוש תפעולי יש לחבר את Supabase ולהזמין את המשתמשים המורשים.
        </small>
      </section>
    );
  }

  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <section className={styles.formPanel} aria-labelledby="login-title">
      <div className={styles.formHeading}>
        <span className={styles.lockIcon} aria-hidden="true">
          <KeyRound />
        </span>
        <div>
          <p className={styles.formEyebrow}>כניסה מאובטחת</p>
          <h2 id="login-title">טוב שחזרת</h2>
        </div>
      </div>

      <p className={styles.formIntro}>
        הכניסה פתוחה רק לחברי צוות שקיבלו הזמנה מראש.
      </p>

      {signedOut && state.status === "idle" ? (
        <p className={styles.successMessage} role="status">
          יצאת מהמערכת בהצלחה.
        </p>
      ) : null}

      {state.message ? (
        <p className={styles.errorMessage} role="alert">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className={styles.form} noValidate>
        <div className={styles.fieldGroup}>
          <label htmlFor="crm-email">אימייל</label>
          <div className={styles.inputShell}>
            <Mail aria-hidden="true" />
            <input
              id="crm-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(emailError)}
              aria-required="true"
              aria-describedby={emailError ? "crm-email-error" : undefined}
              disabled={isPending}
              required
            />
          </div>
          {emailError ? (
            <p className={styles.fieldError} id="crm-email-error">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="crm-password">סיסמה</label>
          <div className={styles.inputShell}>
            <KeyRound aria-hidden="true" />
            <input
              id="crm-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-required="true"
              aria-describedby={
                passwordError ? "crm-password-error" : undefined
              }
              disabled={isPending}
              required
            />
            <button
              className={styles.passwordToggle}
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
              aria-pressed={showPassword}
              disabled={isPending}
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordError ? (
            <p className={styles.fieldError} id="crm-password-error">
              {passwordError}
            </p>
          ) : null}
        </div>

        <button
          className={styles.primaryAction}
          type="submit"
          disabled={isPending}
        >
          {isPending ? (
            <>
              מתחברים
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
            </>
          ) : (
            <>
              כניסה למערכת
              <ArrowLeft aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <p className={styles.supportNote}>
        <Link href="/crm/account/reset">שכחת את הסיסמה?</Link>
        <br />
        אין לך גישה? יש לפנות למנהל המערכת לקבלת הזמנה.
      </p>
    </section>
  );
}
