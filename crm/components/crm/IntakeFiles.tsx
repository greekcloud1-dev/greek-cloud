"use client";

import { useState } from "react";
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import styles from "@/app/crm/crm.module.css";
import type { ClientCase } from "./crm-data";

/* Opens the selfie or the prescription attached to a website intake.
   ---------------------------------------------------------------------------
   The CRM does not hold these files. It asks the server for a link that is
   good for a few minutes and opens it; nothing durable in this database grants
   access to someone's face photo. That is why this is a button rather than an
   <img> or an <a href>: there is no URL to render until a staff member asks
   for one, and the one they get goes stale on its own.

   The window is opened before the await, not after. A popup blocker allows a
   window opened during the click and blocks one opened once a fetch resolves,
   so the reference is taken first and its location is set when the link
   arrives. On failure the blank window is closed again rather than left
   sitting there. */

type FileKind = "selfie" | "rx";

export function IntakeFiles({ client }: { client: ClientCase }) {
  const [pending, setPending] = useState<FileKind | null>(null);
  const [error, setError] = useState("");

  if (!client.selfieFile && !client.rxFile) return null;

  async function open(file: FileKind, label: string) {
    setError("");
    setPending(file);
    const target = window.open("", "_blank", "noopener,noreferrer");
    try {
      const response = await fetch("/api/crm/intake-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: client.id, file }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) {
        target?.close();
        setError(
          response.status === 503
            ? "הצפייה בקבצים טרם הוגדרה."
            : `לא הצלחנו לפתוח את ${label}.`,
        );
        return;
      }
      if (target) target.location.href = body.url;
      else window.location.href = body.url;
    } catch {
      target?.close();
      setError(`לא הצלחנו לפתוח את ${label}.`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.intakeFiles}>
      <span className={styles.copyFieldLabel}>קבצים</span>
      <div className={styles.intakeFileButtons}>
        {client.selfieFile && (
          <button
            type="button"
            className={styles.intakeFileButton}
            onClick={() => open("selfie", "הסלפי")}
            disabled={pending !== null}
          >
            {pending === "selfie" ? (
              <Loader2 aria-hidden="true" size={14} className={styles.spin} />
            ) : (
              <ImageIcon aria-hidden="true" size={14} />
            )}
            סלפי
          </button>
        )}
        {client.rxFile && (
          <button
            type="button"
            className={styles.intakeFileButton}
            onClick={() => open("rx", "המרשם")}
            disabled={pending !== null}
          >
            {pending === "rx" ? (
              <Loader2 aria-hidden="true" size={14} className={styles.spin} />
            ) : (
              <FileText aria-hidden="true" size={14} />
            )}
            מרשם קיים
          </button>
        )}
      </div>
      <p className={styles.intakeFileNote}>
        נפתח בלשונית חדשה בקישור שתוקפו חמש דקות.
      </p>
      {error && (
        <p role="alert" className={styles.intakeFileError}>
          {error}
        </p>
      )}
    </div>
  );
}
