/* ==========================================================================
   GET /api/health
   ==========================================================================

   Tells the intake form whether the real submission pipeline is wired up.
   assets/intake.js polls this on load and shows a "site is under maintenance"
   notice instead of opening the secure path when any of the three pieces
   below is missing. This is the only thing that endpoint decides -- it does
   not touch user data.
   ========================================================================== */

export const config = { runtime: 'edge' };

export default function handler() {
  const configured = Boolean(
    process.env.RESEND_API_KEY &&
    process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.LEAD_NOTIFY_EMAIL
  );

  return new Response(JSON.stringify({ configured }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
