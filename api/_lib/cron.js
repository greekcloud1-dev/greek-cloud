import { stuckReasons, STUCK_LABELS, firstName, formatDate, cityLabel } from '../../crm/core.js';
import { safeEqual } from './session.js';
import { loadClients } from './clients.js';
import { notifyAll } from './notify.js';

export const CRM_URL = 'https://greek-cloud.com/crm/';

/** The morning message, or null when nothing is waiting. Names are shortened on purpose. */
export function stuckDigest(clients, nowMs) {
  const stuck = clients
    .map((c) => ({ c, reasons: stuckReasons(c, nowMs) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => String(a.c.flightDate || '9999').localeCompare(String(b.c.flightDate || '9999')));
  if (!stuck.length) return null;
  const lines = stuck.slice(0, 25).map(({ c, reasons }) => {
    const parts = c.fullName.trim().split(/\s+/);
    const name = parts.length > 1 ? `${firstName(c.fullName)} ${parts[parts.length - 1][0]}.` : firstName(c.fullName);
    const trip = c.flightDate ? `טס ${formatDate(c.flightDate).slice(0, 5)}` : 'בלי תאריך';
    const city = cityLabel(c.city);
    return `• ${name}${city ? ` · ${city}` : ''} · ${trip} — ${reasons.map((r) => STUCK_LABELS[r]).join(', ')}`;
  });
  if (stuck.length > 25) lines.push(`ועוד ${stuck.length - 25}…`);
  return {
    count: stuck.length,
    subject: stuck.length === 1 ? 'GreekCloud · לקוח אחד מחכה לך' : `GreekCloud · ${stuck.length} לקוחות מחכים לך`,
    text: lines.join('\n'),
    url: `${CRM_URL}?f=stuck`,
  };
}

export function createCronHandler({ env, store, now = () => Date.now(), notify = notifyAll }) {
  return async function handle(request) {
    const secret = env.CRON_SECRET || '';
    const auth = request.headers.get('authorization') || '';
    if (secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    const digest = stuckDigest(await loadClients(store), now());
    const sent = digest ? await notify(env, digest) : null;
    return new Response(JSON.stringify({ ok: true, stuck: digest ? digest.count : 0, sent }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
}
