"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "@/app/crm/crm.module.css";

/* A value with its own copy button.
   ---------------------------------------------------------------------------
   Staff read a detail off the screen and paste it somewhere else all day --
   a passport number into a physician's form, a phone number into WhatsApp, the
   health description into a referral. Retyping a passport number by eye is how
   a case gets rejected at the pharmacy, so every field carries a button.

   Confirmation is both seen and announced: the icon becomes a tick for a
   moment, and the same words go into a polite live region so a screen-reader
   user is told the copy happened rather than watching an icon they cannot see.
   navigator.clipboard needs a secure context and can be refused outright, so a
   failure says so instead of silently pretending. */

const CONFIRM_MS = 1600;

type CopyFieldProps = {
  label: string;
  value: string;
  /** Rendered instead of `value` when the display form differs from what
      should land on the clipboard -- a formatted date, say, or a list. */
  display?: React.ReactNode;
  /** Long free text (the health description) gets room to breathe. */
  block?: boolean;
};

export function CopyField({ label, value, display, block }: CopyFieldProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), CONFIRM_MS);
  }, [value]);

  if (!value) return null;

  const message =
    state === "copied"
      ? `${label} הועתק`
      : state === "failed"
        ? `לא הצלחנו להעתיק ${label}`
        : "";

  return (
    <div className={block ? styles.copyFieldBlock : styles.copyField}>
      <span className={styles.copyFieldLabel}>{label}</span>
      <span className={styles.copyFieldValue}>{display ?? value}</span>
      <button
        type="button"
        className={styles.copyFieldButton}
        onClick={copy}
        /* The label names the field, so a screen reader announces "copy
           passport number" rather than seven identical "copy" buttons. */
        aria-label={`העתקת ${label}`}
        data-state={state}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={14} />
        ) : (
          <Copy aria-hidden="true" size={14} />
        )}
        <span className={styles.copyFieldButtonText}>
          {state === "copied" ? "הועתק" : state === "failed" ? "נכשל" : "העתקה"}
        </span>
      </button>
      <span role="status" aria-live="polite" className={styles.srOnly}>
        {message}
      </span>
    </div>
  );
}
