/** The website-to-CRM boundary. Never spread an intake record into this payload.
 *
 *  Every field is named explicitly, one at a time, and that is the whole point:
 *  a spread would carry the health description, passport number, age, the
 *  existing-prescription answer and the Blob paths of a face photo and a
 *  prescription across a boundary that exists to keep them out. The CRM is an
 *  operational system and holds operational fields only.
 *
 *  Adding a field here means deciding it is operational rather than medical or
 *  identifying, and updating the receiving schema and the SQL function to match
 *  -- the receiver is strict and rejects anything it does not name. */
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
  };
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
