"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      language: string;
      theme: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

export function TurnstileChallenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const tokenCallback = useRef(onToken);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  tokenCallback.current = onToken;

  useEffect(() => {
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
    if (!ready || !container.current || !api) return;
    const widget = api.render(container.current, {
      sitekey: siteKey,
      action: "lead_intake",
      language: "he",
      theme: "light",
      callback: (token) => {
        setLoadError(false);
        tokenCallback.current(token);
      },
      "expired-callback": () => tokenCallback.current(""),
      "error-callback": () => {
        setLoadError(true);
        tokenCallback.current("");
      },
    });
    return () => api.remove(widget);
  }, [ready, siteKey]);

  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setLoadError(true)}
      />
      <div ref={container} />
      {loadError && (
        <p role="alert">
          האימות לא נטען. כדאי לבדוק את החיבור ולרענן את העמוד.
        </p>
      )}
    </div>
  );
}
