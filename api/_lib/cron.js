import {
  stuckReasons, STUCK_LABELS, firstName, formatDate, cityLabel, replyDeadline, timeLabel,
  reviewCandidate, retentionDue,
} from '../../crm/core.js';
import { safeEqual } from './session.js';
import { loadClients } from './clients.js';
import { notifyAll } from './notify.js';

export const CRM_URL = 'https://greek-cloud.com/crm/';
const DAY_MS = 86400000;

function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return parts.length > 1 ? `${firstName(fullName)} ${parts[parts.length - 1][0]}.` : firstName(fullName);
}

function hoursLeft(ms) {
  const h = Math.floor(Math.abs(ms) / 3600000);
  return h < 1 ? 'פחות משעה' : h === 1 ? 'שעה' : `${h} שעות`;
}

const more = (n) => (n > 20 ? [`ועוד ${n - 20}…`] : []);

/** The morning message, or null when nothing is waiting. Names are shortened on purpose. */
export function stuckDigest(clients, nowMs) {
  const sections = [];

  const waiting = clients
    .filter((c) => !c.lost && !c.contacted && Number.isFinite(Date.parse(c.receivedAt))
      && nowMs - Date.parse(c.receivedAt) < 30 * DAY_MS)
    .map((c) => ({ c, due: replyDeadline(c) }))
    .sort((a, b) => (a.c.plan === 'vip' ? 0 : 1) - (b.c.plan === 'vip' ? 0 : 1) || a.due - b.due);
  if (waiting.length) {
    sections.push('ממתינים למענה ראשון:', ...waiting.slice(0, 20).map(({ c, due }) => {
      const when = due === null ? '' : due < nowMs ? `באיחור של ${hoursLeft(nowMs - due)}` : `להשיב עד ${timeLabel(due, nowMs)}`;
      return `• ${shortName(c.fullName)}${c.plan === 'vip' ? ' · VIP' : ''} · ${when}`;
    }), ...more(waiting.length));
  }

  const other = clients
    .map((c) => ({ c, reasons: stuckReasons(c, nowMs).filter((r) => r !== 'no_contact' && r !== 'vip_reply') }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => String(a.c.flightDate || '9999').localeCompare(String(b.c.flightDate || '9999')));
  if (other.length) {
    if (sections.length) sections.push('');
    sections.push('דורשים טיפול:', ...other.slice(0, 20).map(({ c, reasons }) => {
      const trip = c.flightDate ? `טס ${formatDate(c.flightDate).slice(0, 5)}` : 'בלי תאריך';
      const city = cityLabel(c.city);
      return `• ${shortName(c.fullName)}${city ? ` · ${city}` : ''} · ${trip} — ${reasons.map((r) => STUCK_LABELS[r]).join(', ')}`;
    }), ...more(other.length));
  }

  const back = clients.filter((c) => reviewCandidate(c, nowMs)).length;
  const dueList = clients.filter((c) => retentionDue(c, nowMs));
  const erase = dueList.filter((c) => c.lost && c.lost.reason === 'erase_request').length;
  const due = dueList.length - erase;
  const notes = [];
  if (back) notes.push(back === 1 ? 'לקוח אחד נחת ביוון בימים האחרונים: אפשר לבקש המלצה.' : `${back} לקוחות נחתו ביוון בימים האחרונים: אפשר לבקש המלצה.`);
  if (erase) notes.push(erase === 1 ? 'לקוח אחד ביקש מחיקה: למחוק עכשיו.' : `${erase} לקוחות ביקשו מחיקה: למחוק עכשיו.`);
  if (due) notes.push(due === 1 ? 'רשומה אחת ממתינה למחיקה לפי מדיניות הפרטיות.' : `${due} רשומות ממתינות למחיקה לפי מדיניות הפרטיות.`);
  if (notes.length) {
    if (sections.length) sections.push('');
    sections.push(...notes);
  }

  if (!sections.length) return null;
  const count = new Set([...waiting, ...other].map((x) => x.c.id)).size;
  return {
    count,
    subject: count === 0 ? 'GreekCloud · עדכון בוקר'
      : count === 1 ? 'GreekCloud · לקוח אחד מחכה לך' : `GreekCloud · ${count} לקוחות מחכים לך`,
    text: sections.join('\n'),
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
    // The CRM header turns red when this stamp is stale or a channel failed.
    await store.putJSON('crm/health.json', {
      lastRun: new Date(now()).toISOString(),
      email: sent ? sent.email : 'idle',
      telegram: sent ? sent.telegram : 'idle',
    }).catch(() => {});
    return new Response(JSON.stringify({ ok: true, stuck: digest ? digest.count : 0, sent }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
}
