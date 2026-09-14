/* ==========================================================================
   GET /api/intake-file
   ==========================================================================

   Serves one file from a stored intake -- the selfie or the prescription --
   to a holder of a signed, expiring link.

   WHY THIS EXISTS, AND WHY IT IS SHAPED THIS WAY

   The CRM needs to show staff the selfie and the prescription. The obvious
   options were both worse than this one:

     * copy the files into the CRM's storage. Then a face photo and a
       prescription exist in two systems, and deleting one does not delete the
       other. Retention becomes two problems instead of one.
     * hand the CRM a long-lived URL. Then the URL is the secret, it sits in a
       database row, and it cannot be withdrawn.

   Instead the website stays the only holder of the bytes. The CRM knows the
   submission id and the file's basename, shares one secret with this endpoint,
   and mints a link that is good for a few minutes. Nothing durable grants
   access; access is a signature with a deadline.

   WHAT THE SIGNATURE COVERS

   The submission id, which file, the basename, and the expiry -- all four.
   Signing less would let a holder of one link edit it into another: swap the
   submission id and read someone else's photo, point it at the other file, or
   push the expiry out and keep the link forever. The comparison is
   constant-time, and the secret never leaves the server on either side.

   There is deliberately no listing, no directory, and no free-form path. The
   caller names a submission and picks from a two-item enum; the storage key is
   built here. A caller cannot express "../" because there is nowhere to put it.
   ========================================================================== */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { get } from '@vercel/blob';

/** Only these two, and the name maps to a fixed prefix. */
const FILES = { selfie: 'selfie', rx: 'prescription' };

/* The basename carries the extension the upload actually turned out to be
   (jpg/png/webp/heic/pdf), so it travels in the link. It is validated to the
   same shape api/submit.js writes -- a bare name, never a path. */
/* (?![\s\S]) rather than $: in JavaScript `$` also matches just before a
   trailing newline, so "selfie.jpg\n" would otherwise pass and end up in a
   storage key. Nothing reaching here is attacker-generated today, but the
   whole job of this pattern is to be the thing that cannot be talked past. */
const BASENAME = /^[a-z]+\.[a-z0-9]{2,5}(?![\s\S])/;

function fail(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** The exact string both sides sign. Kept in one place so they cannot drift. */
export function signingPayload({ submissionId, file, name, expires }) {
  return [submissionId, file, name, String(expires)].join('\n');
}

export function signIntakeFile(secret, parts) {
  return createHmac('sha256', secret).update(signingPayload(parts)).digest('hex');
}

function signatureMatches(expected, provided) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(typeof provided === 'string' ? provided : '', 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleIntakeFile(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fail(405, 'method_not_allowed');
  }

  const secret = process.env.INTAKE_FILE_SECRET;
  if (!secret || secret.length < 32 || !process.env.BLOB_READ_WRITE_TOKEN) {
    return fail(503, 'not_configured');
  }

  const url = new URL(request.url);
  const submissionId = url.searchParams.get('sid') ?? '';
  const file = url.searchParams.get('f') ?? '';
  const name = url.searchParams.get('n') ?? '';
  const expires = Number(url.searchParams.get('exp'));
  const signature = url.searchParams.get('sig') ?? '';

  if (!/^[A-Za-z0-9_-]{8,100}$/.test(submissionId)) return fail(400, 'bad_request');
  if (!Object.hasOwn(FILES, file)) return fail(400, 'bad_request');
  if (!BASENAME.test(name)) return fail(400, 'bad_request');
  if (!Number.isSafeInteger(expires)) return fail(400, 'bad_request');

  /* Expiry before signature: an expired link is refused whether or not the
     signature is right, and saying so costs nothing -- the deadline is in the
     link the caller already holds. */
  if (Date.now() > expires) return fail(410, 'link_expired');

  const expected = signIntakeFile(secret, { submissionId, file, name, expires });
  if (!signatureMatches(expected, signature)) return fail(403, 'bad_signature');

  /* The name must belong to the file it claims to be, so a link for the selfie
     cannot be pointed at the prescription by editing one parameter -- even
     though the signature already covers both, this keeps the storage key
     honest on its own terms. */
  if (!name.startsWith(`${FILES[file]}.`)) return fail(400, 'bad_request');

  try {
    const { stream, headers } = await get(`submissions/${submissionId}/${name}`, {
      access: 'private',
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': headers.get('content-type') ?? 'application/octet-stream',
        /* Viewed in place rather than downloaded, and never stored by a proxy
           or the browser: this is somebody's face and medical paperwork. */
        'content-disposition': `inline; filename="${name}"`,
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch {
    // A missing blob and a storage outage are not distinguished for the caller.
    return fail(404, 'not_found');
  }
}

export default { fetch: handleIntakeFile };
