/** The website-to-CRM payload. Never spread an intake record into it.
 *
 *  The owner decided the staff working a case need the whole submission, so
 *  this now carries the health description, passport number and age as well as
 *  the operational fields. Every field is still named one at a time rather than
 *  spread: what crosses has to be a decision someone made and can point at, and
 *  a spread would silently carry whatever `record` grows next.
 *
 *  Two things deliberately do NOT cross, and adding them would be a mistake:
 *  the file bytes, and any Blob URL or token. Only the basenames travel. The
 *  website keeps the files and serves each one through a short-lived signed
 *  link, so possession of a CRM row is not possession of someone's face photo.
 *
 *  The receiving schema is strict: a key it does not name is a rejected
 *  request, so adding a field here means updating that schema and the SQL
 *  function in the same change. */
export function crmContactPayload(record) {
  return {
    submissionId: record.submissionId,
    fullName: record.fullName,
    phone: record.phone,
    email: record.email,
    destination: record.city,
    // Which plan was bought: the most commercially relevant fact about the
    // request, and previously invisible to whoever picked up the case.
    plan: record.plan,
    // The approximate arrival date as submitted. Kept apart from the flight
    // time on purpose -- see the note in migration 007.
    arrivalOn: record.arrival || null,
    // Answer an English speaker in English.
    locale: record.locale,

    // --- the full submission, per the owner's decision ------------------
    passport: record.passport || null,
    age: record.age ? Number(record.age) : null,
    // The free-text health narrative. The most sensitive thing that crosses.
    condition: record.condition || null,
    rxState: record.rxExists || null,
    consents: record.consents || {},
    // Basenames only. `selfiePath` is 'submissions/<id>/selfie.jpg'; the CRM
    // gets 'selfie.jpg' and cannot reach the file without a link the website
    // mints and expires.
    selfieFile: basename(record.selfiePath),
    rxFile: basename(record.rxPath),
  };
}

function basename(path) {
  if (typeof path !== 'string' || !path) return null;
  const last = path.slice(path.lastIndexOf('/') + 1);
  // Matches what api/submit.js writes and what the CRM column accepts. A value
  // that does not look like one of our own fixed names is dropped rather than
  // passed along: it could only have come from something unexpected.
  // (?![\s\S]) not $: `$` also matches before a trailing newline in JS.
  return /^[a-z]+\.[a-z0-9]{2,5}(?![\s\S])/.test(last) ? last : null;
}

export async function syncCrmContact(payload) {
  const endpoint = process.env.CRM_INGEST_URL;
  const secret = process.env.CRM_INGEST_SECRET;
  if (!endpoint || !secret) return { status: 'not_configured' };
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || secret.length < 32) {
      return { status: 'configuration_error' };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: 'pending', code: `http_${response.status}` };
    const result = await response.json();
    return result.ok === true && typeof result.caseId === 'string'
      ? { status: 'synced', caseId: result.caseId }
      : { status: 'pending', code: 'invalid_response' };
  } catch {
    // A timeout can follow a successful write. Replay the SAME submissionId;
    // the receiving transaction returns the existing case instead of duplicating.
    return { status: 'pending', code: 'delivery_unconfirmed' };
  }
}
