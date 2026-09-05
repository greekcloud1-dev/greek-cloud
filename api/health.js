/* ==========================================================================
   GET /api/health
   ==========================================================================

   Tells the intake form whether the real submission pipeline is wired up.
   assets/intake.js polls this on load and shows a "site is under maintenance"
   notice instead of opening the secure path when any of the three pieces
   below is missing. This is the only thing that endpoint decides -- it does
   not touch user data.

   It answers with one boolean and never with the values themselves: whether a
   key is set is what the form needs to know, and the key is not.

   Runs on the Node.js runtime, not Edge: /api/submit needs Node built-ins
   that @vercel/blob and resend depend on, and these two stay on the same
   runtime so "configured" cannot report differently from what submit can
   actually do. The `export default { fetch }` shape is the Web-standard
   signature that Vercel's Node runtime supports, so the handler code is
   still plain Request/Response.
   ========================================================================== */

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export default {
  fetch(request) {
    // A status probe is a read. Anything else is a caller doing something
    // this endpoint was not built for, and it gets told so rather than
    // quietly receiving a 200.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...HEADERS, allow: 'GET, HEAD' },
      });
    }

    const configured = Boolean(
      process.env.RESEND_API_KEY &&
      process.env.BLOB_READ_WRITE_TOKEN &&
      process.env.LEAD_NOTIFY_EMAIL
    );

    return new Response(JSON.stringify({ configured }), {
      status: 200,
      headers: HEADERS,
    });
  },
};
