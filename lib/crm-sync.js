/** The website-to-CRM payload. Never spread an intake record into it.
 *
 *  The owner decided the staff working a case need the whole submission, so
 *  this carries the health description, passport number and age along with the
 *  operational fields. Every field is still named one at a time rather than
 *  spread: what crosses has to be a decision someone made and can point at,
 *  and a spread would silently carry whatever `record` grows next.
 *
 *  The files do not travel -- their object paths do. Both systems are now the
 *  same Supabase project, so the CRM signs a path directly when a staff member
 *  asks to see a file. A path is not a URL and grants nothing on its own.
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
    passport: record.passport || null,
    age: record.age ? Number(record.age) : null,
    // The free-text health narrative. The most sensitive thing that crosses.
    condition: record.condition || null,
    rxState: record.rxExists || null,
    consents: record.consents || {},
    // Object paths inside the private bucket, e.g.
    // 'submissions/<id>/selfie.jpg'. Anything that is not one is dropped.
    selfiePath: objectPath(record.selfiePath),
    rxPath: objectPath(record.rxPath),
  };
}

/* The shape api/submit.js writes and the CRM column accepts. A value that is
   not one could only have come from something unexpected, so it is dropped
   rather than passed along. */
const OBJECT_PATH = /^submissions\/[A-Za-z0-9_-]{8,100}\/[a-z]+\.[a-z0-9]{2,5}(?![\s\S])/;

function objectPath(value) {
  return typeof value === 'string' && OBJECT_PATH.test(value) ? value : null;
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
