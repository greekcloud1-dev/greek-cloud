import "server-only";
import { createHash } from "node:crypto";

const MAX_BODY_BYTES = 12 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const recentRequests = new Map<string, { count: number; expiresAt: number }>();

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : requestOrigin;
    return origin === configuredOrigin;
  } catch {
    return false;
  }
}

/** A bounded per-instance throttle. Turnstile supplies protection across instances. */
export function consumeIntakeLimit(request: Request): boolean {
  const now = Date.now();
  for (const [key, entry] of recentRequests) {
    if (entry.expiresAt <= now) recentRequests.delete(key);
  }
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const key = createHash("sha256").update(clientAddress).digest("hex");
  const existing = recentRequests.get(key);
  if (existing) {
    if (existing.count >= 8) return false;
    existing.count += 1;
    return true;
  }
  if (recentRequests.size >= 10_000) return false;
  recentRequests.set(key, { count: 1, expiresAt: now + WINDOW_MS });
  return true;
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
}

export async function verifyTurnstile(
  token: string,
  request: Request,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return false;
  if (!token) return false;
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  const expectedHostname = new URL(request.url).hostname;
  return (
    result.success === true &&
    result.action === "lead_intake" &&
    result.hostname === expectedHostname
  );
}
