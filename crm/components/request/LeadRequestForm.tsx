"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Pencil,
  Plane,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  FLIGHT_TIMEZONES,
  REQUEST_CHANNELS,
  REQUEST_SERVICES,
  leadRequestSchema,
  normalizeRequestPhone,
  type LeadRequest,
} from "@/lib/request/schema";
import { TurnstileChallenge } from "./TurnstileChallenge";
import styles from "@/app/request/request.module.css";

type FormValues = Omit<LeadRequest, "contactConsent"> & {
  contactConsent: boolean;
};
type Attribution = Pick<
  LeadRequest,
  "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm"
>;

export function LeadRequestForm({
  service,
  attribution,
  acceptingRequests,
  turnstileSiteKey,
}: {
  service: LeadRequest["service"];
  attribution: Attribution;
  acceptingRequests: boolean;
  turnstileSiteKey?: string;
}) {
  const [form, setForm] = useState<FormValues>({
    fullName: "",
    phone: "",
    email: "",
    service,
    preferredChannel: "whatsapp",
    flightLocal: "",
    flightTimezone: "Asia/Jerusalem",
    contactConsent: false,
    website: "",
    turnstileToken: "",
    ...attribution,
  });
  const [step, setStep] = useState<"details" | "review" | "complete">(
    "details",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [verificationVersion, setVerificationVersion] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  function update<Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = leadRequestSchema.safeParse({
      ...form,
      email: form.email.trim(),
    });
    if (!result.success) {
      const fields = Object.fromEntries(
        result.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      );
      setErrors(fields);
      const firstField = result.error.issues[0]?.path[0];
      if (firstField)
        document.getElementById(`request-${String(firstField)}`)?.focus();
      return;
    }
    setForm(result.data);
    setStep("review");
  }

  async function sendRequest() {
    if (submitting || !acceptingRequests) return;
    setSubmitting(true);
    setServerError("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        reference?: string;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok || !result.reference) {
        setServerError(
          result.error || "השליחה לא הושלמה. אפשר לנסות שוב בעוד רגע.",
        );
        setForm((current) => ({ ...current, turnstileToken: "" }));
        setVerificationVersion((current) => current + 1);
        if (result.fields) {
          setErrors(result.fields);
          setStep("details");
        }
        return;
      }
      setReference(result.reference);
      setStep("complete");
    } catch {
      setServerError(
        "החיבור נותק לפני שהתקבל אישור. הפנייה אולי נקלטה; כדאי לבדוק עם הצוות לפני שליחה נוספת.",
      );
      setForm((current) => ({ ...current, turnstileToken: "" }));
      setVerificationVersion((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const errorFor = (key: string) =>
    errors[key] ? (
      <span id={`error-${key}`} className={styles.fieldError}>
        {errors[key]}
      </span>
    ) : null;
  const fieldAttributes = (key: string) => ({
    id: `request-${key}`,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `error-${key}` : undefined,
  });

  return (
    <section className={styles.card} aria-labelledby="request-heading">
      {step !== "complete" && (
        <ol className={styles.progress} aria-label="שלבי הפנייה">
          <li aria-current={step === "details" ? "step" : undefined}>
            <span>
              {step === "review" ? <Check size={14} aria-hidden="true" /> : "1"}
            </span>
            פרטי הפנייה
          </li>
          <li aria-current={step === "review" ? "step" : undefined}>
            <span>2</span>בדיקה ושליחה
          </li>
        </ol>
      )}

      {step === "complete" ? (
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <h2 ref={heading} tabIndex={-1} id="request-heading">
            הפנייה שלך אצלנו.
          </h2>
          <p>
            הצוות יחזור אליך ב{REQUEST_CHANNELS[form.preferredChannel]} להמשך
            תיאום.
          </p>
          <div className={styles.reference}>
            <span>מספר הפנייה שלך</span>
            <strong dir="ltr">{reference}</strong>
          </div>
          <p className={styles.hours}>
            <Clock3 size={17} aria-hidden="true" />
            ראשון–חמישי 09:00–22:00 · שישי 09:00–14:00
          </p>
          <Link href="https://www.greekcloud.co.il/" className={styles.primary}>
            חזרה לאתר
            <ArrowLeft size={17} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <h2 ref={heading} tabIndex={-1} id="request-heading">
            {step === "details" ? "איך אפשר לחזור אליך?" : "רגע לפני ששולחים"}
          </h2>
          <p className={styles.cardLead}>
            {step === "details"
              ? "השדות המסומנים בכוכבית נדרשים ליצירת קשר."
              : "כדאי לוודא שמספר הטלפון ומועד הטיסה נכונים."}
          </p>
          {!acceptingRequests && (
            <p className={styles.unavailable} role="status">
              הטופס בהכנה. אפשר לעבור על השלבים, אך עדיין לא ניתן לשלוח פניות.
            </p>
          )}
          {serverError && (
            <p className={styles.errorSummary} role="alert">
              {serverError}
            </p>
          )}

          {step === "details" ? (
            <form onSubmit={review} noValidate>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span>
                    שם מלא <b aria-hidden="true">*</b>
                  </span>
                  <input
                    {...fieldAttributes("fullName")}
                    name="name"
                    autoComplete="name"
                    maxLength={160}
                    required
                    value={form.fullName}
                    onChange={(event) => update("fullName", event.target.value)}
                  />
                  {errorFor("fullName")}
                </label>
                <label className={styles.field}>
                  <span>
                    מספר טלפון <b aria-hidden="true">*</b>
                  </span>
                  <input
                    {...fieldAttributes("phone")}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="050-1234567"
                    maxLength={32}
                    required
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                  {errorFor("phone")}
                </label>
                <label className={styles.field}>
                  <span>
                    אימייל{" "}
                    <small>
                      {form.preferredChannel === "email"
                        ? "(נדרש)"
                        : "(לא חובה)"}
                    </small>
                  </span>
                  <input
                    {...fieldAttributes("email")}
                    name="email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    maxLength={320}
                    required={form.preferredChannel === "email"}
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                  />
                  {errorFor("email")}
                </label>
                <label className={styles.field}>
                  <span>
                    במה נוכל לעזור? <b aria-hidden="true">*</b>
                  </span>
                  <select
                    {...fieldAttributes("service")}
                    value={form.service}
                    onChange={(event) =>
                      update(
                        "service",
                        event.target.value as LeadRequest["service"],
                      )
                    }
                  >
                    {Object.entries(REQUEST_SERVICES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {errorFor("service")}
                </label>
              </div>

              <fieldset className={styles.channels}>
                <legend>
                  איך נוח לך שנחזור? <b aria-hidden="true">*</b>
                </legend>
                <div>
                  {Object.entries(REQUEST_CHANNELS).map(([key, label]) => (
                    <label
                      key={key}
                      className={
                        form.preferredChannel === key
                          ? styles.selectedChannel
                          : undefined
                      }
                    >
                      <input
                        type="radio"
                        name="preferredChannel"
                        value={key}
                        checked={form.preferredChannel === key}
                        onChange={() => {
                          update(
                            "preferredChannel",
                            key as LeadRequest["preferredChannel"],
                          );
                          update("contactConsent", false);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.flightBlock}>
                <div className={styles.flightTitle}>
                  <Plane size={20} aria-hidden="true" />
                  <div>
                    <strong>כבר יש תאריך טיסה?</strong>
                    <p>לא חובה. המועד יעזור לנו לתכנן את התיאום.</p>
                  </div>
                </div>
                <div className={styles.flightFields}>
                  <label className={styles.field}>
                    <span>תאריך ושעת ההמראה</span>
                    <input
                      {...fieldAttributes("flightLocal")}
                      type="datetime-local"
                      value={form.flightLocal}
                      onChange={(event) =>
                        update("flightLocal", event.target.value)
                      }
                    />
                    {errorFor("flightLocal")}
                  </label>
                  <label className={styles.field}>
                    <span>השעה שהזנתי היא לפי</span>
                    <select
                      {...fieldAttributes("flightTimezone")}
                      value={form.flightTimezone}
                      onChange={(event) =>
                        update(
                          "flightTimezone",
                          event.target.value as LeadRequest["flightTimezone"],
                        )
                      }
                    >
                      {Object.entries(FLIGHT_TIMEZONES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.honeypot} aria-hidden="true">
                <label>
                  כתובת אתר
                  <input
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(event) => update("website", event.target.value)}
                  />
                </label>
              </div>
              <label className={styles.consent}>
                <input
                  {...fieldAttributes("contactConsent")}
                  type="checkbox"
                  checked={form.contactConsent}
                  required
                  onChange={(event) =>
                    update("contactConsent", event.target.checked)
                  }
                />
                <span>
                  אני מאשר/ת ל־GreekCloud ליצור איתי קשר ב
                  {REQUEST_CHANNELS[form.preferredChannel]} בנוגע לפנייה הזו.
                  הפרטים יישמרו לצורך הטיפול בפנייה, בהתאם ל
                  <Link
                    href="https://www.greekcloud.co.il/privacy.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    מדיניות הפרטיות
                  </Link>
                  .
                </span>
              </label>
              {errorFor("contactConsent")}
              <p className={styles.privacyNote}>
                <LockKeyhole size={16} aria-hidden="true" />
                כאן משאירים פרטי קשר בלבד. אין לשלוח מידע רפואי, דרכון או
                מסמכים.
              </p>
              <button className={styles.primary} type="submit">
                לבדיקת הפרטים
                <ArrowLeft size={17} aria-hidden="true" />
              </button>
              <p className={styles.footnote}>
                הפרטים יישלחו רק אחרי האישור בשלב הבא.
              </p>
            </form>
          ) : (
            <div>
              <dl className={styles.reviewList}>
                <div>
                  <dt>שם מלא</dt>
                  <dd>{form.fullName}</dd>
                </div>
                <div>
                  <dt>טלפון</dt>
                  <dd dir="ltr">{normalizeRequestPhone(form.phone)}</dd>
                </div>
                {form.email && (
                  <div>
                    <dt>אימייל</dt>
                    <dd dir="ltr">{form.email}</dd>
                  </div>
                )}
                <div>
                  <dt>השירות</dt>
                  <dd>{REQUEST_SERVICES[form.service]}</dd>
                </div>
                <div>
                  <dt>יצירת קשר</dt>
                  <dd>{REQUEST_CHANNELS[form.preferredChannel]}</dd>
                </div>
                <div>
                  <dt>מועד טיסה</dt>
                  <dd>
                    {form.flightLocal ? (
                      <>
                        <bdi>
                          {form.flightLocal
                            .slice(0, 10)
                            .split("-")
                            .reverse()
                            .join(".")}{" "}
                          · {form.flightLocal.slice(11)}
                        </bdi>
                        <small>{FLIGHT_TIMEZONES[form.flightTimezone]}</small>
                      </>
                    ) : (
                      "טרם נקבע"
                    )}
                  </dd>
                </div>
              </dl>
              <button
                className={styles.editButton}
                type="button"
                disabled={submitting}
                onClick={() => setStep("details")}
              >
                <Pencil size={15} aria-hidden="true" />
                עריכת הפרטים
              </button>
              <p className={styles.reviewConsent}>
                <Check size={17} aria-hidden="true" />
                אישרת יצירת קשר ב{REQUEST_CHANNELS[form.preferredChannel]} בנוגע
                לפנייה.
              </p>
              {turnstileSiteKey && (
                <div className={styles.verification}>
                  <TurnstileChallenge
                    key={verificationVersion}
                    siteKey={turnstileSiteKey}
                    onToken={(token) =>
                      setForm((current) => ({
                        ...current,
                        turnstileToken: token,
                      }))
                    }
                  />
                </div>
              )}
              <button
                className={styles.primary}
                type="button"
                disabled={
                  submitting ||
                  !acceptingRequests ||
                  Boolean(turnstileSiteKey && !form.turnstileToken)
                }
                onClick={sendRequest}
              >
                {submitting ? "שולחים את הפנייה…" : "אישור ושליחת הפנייה"}
                {!submitting && <ArrowLeft size={17} aria-hidden="true" />}
              </button>
              <button
                className={styles.backButton}
                type="button"
                disabled={submitting}
                onClick={() => setStep("details")}
              >
                <ArrowRight size={15} aria-hidden="true" />
                חזרה לפרטים
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
