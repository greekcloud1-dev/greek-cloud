/* ==========================================================================
   GET /api/health
   ==========================================================================

   Tells the intake form whether the real submission pipeline is wired up.
   assets/intake.js polls this on load and shows a "site is under maintenance"
   notice instead of opening the secure path when any of the three pieces
   below is missing. This is the only thing that endpoint decides -- it does
   not touch user data.

   Runs on the Node.js runtime, not Edge: /api/submit needs Node built-ins
   that @vercel/blob and resend depend on, and these two stay on the same
   runtime so "configured" cannot report differently from what submit can
   actually do. The `export default { fetch }` shape is the Web-standard
   signature that Vercel's Node runtime supports, so the handler code is
   still plain Request/Response.
   ========================================================================== */

export default {
  fetch() {
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
  },
};
