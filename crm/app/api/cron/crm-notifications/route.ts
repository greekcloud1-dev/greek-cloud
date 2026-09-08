import { timingSafeEqual } from "node:crypto";
import { dispatchCrmNotifications } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json(
      { ok: false, error: "cron_not_configured" },
      { status: 503, headers },
    );
  }
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers },
    );
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    return Response.json(
      { ok: false, error: "database_not_configured" },
      { status: 503, headers },
    );
  }
  try {
    const result = await dispatchCrmNotifications();
    return Response.json(result, { status: result.ok ? 200 : 503, headers });
  } catch {
    // Do not expose provider responses, recipients or secret-bearing URLs.
    return Response.json(
      { ok: false, error: "notification_worker_failed" },
      { status: 503, headers },
    );
  }
}

// GET supports managed cron providers; both verbs require the same Bearer secret.
export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
