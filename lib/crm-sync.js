/** The website-to-CRM boundary. Never spread an intake record into this payload. */
export function crmContactPayload(record) {
  return {
    submissionId: record.submissionId,
    fullName: record.fullName,
    phone: record.phone,
    email: record.email,
    destination: record.city,
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
