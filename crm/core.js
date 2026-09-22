/* GreekCloud CRM — shared logic.
   Pure functions only: no DOM, no network, no Node built-ins. The browser loads
   this file as a module and the serverless functions import it, so the list the
   owner sees and the list the daily alert checks are computed by the same code. */

export const TZ = 'Asia/Jerusalem';
export const INDEX_VERSION = 3;
const DAY_MS = 86400000;

export const CITIES = [
  { he: 'אתונה', en: 'Athens', alt: ['athens', 'piraeus', 'אתונה', 'פיראוס'] },
  { he: 'סלוניקי', en: 'Thessaloniki', alt: ['thessaloniki', 'saloniki', 'סלוניקי', 'תסלוניקי'] },
  { he: 'כרתים', en: 'Crete', alt: ['crete', 'heraklion', 'chania', 'rethymno', 'כרתים', 'הרקליון', 'חאניה', 'רתימנו'] },
  { he: 'רודוס', en: 'Rhodes', alt: ['rhodes', 'rodos', 'רודוס'] },
  { he: 'קוס', en: 'Kos', alt: ['kos', 'קוס'] },
  { he: 'סנטוריני', en: 'Santorini', alt: ['santorini', 'thira', 'סנטוריני'] },
  { he: 'מיקונוס', en: 'Mykonos', alt: ['mykonos', 'מיקונוס'] },
  { he: 'קורפו', en: 'Corfu', alt: ['corfu', 'kerkyra', 'קורפו'] },
  { he: 'זקינתוס', en: 'Zakynthos', alt: ['zakynthos', 'zante', 'זקינתוס', 'זנטה'] },
  { he: 'לפקדה', en: 'Lefkada', alt: ['lefkada', 'לפקדה'] },
  { he: 'חלקידיקי', en: 'Halkidiki', alt: ['halkidiki', 'chalkidiki', 'חלקידיקי'] },
];

export const SOURCES = {
  google: 'גוגל', facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק',
  whatsapp: 'וואטסאפ', ai: 'צ׳אט AI', friend: 'חבר המליץ', phone: 'טלפון',
  direct: 'ישיר לאתר', other: 'אחר',
};

export const LOST_REASONS = {
  no_answer: 'לא עונה', expensive: 'יקר מדי', not_eligible: 'לא מתאים',
  cancelled: 'ביטל נסיעה', other: 'אחר',
};

export const STEPS = { contacted: 'נוצר קשר', paid: 'שולם', rxIssued: 'מרשם יצא' };

export const STUCK_LABELS = {
  no_contact: 'עוד לא נוצר קשר',
  unpaid_soon: 'טס בקרוב ולא שילם',
  no_rx_soon: 'טס בקרוב ואין מרשם',
};

const PLAN_LABELS = { standard: 'סטנדרט', vip: 'VIP' };
const RX_LABELS = { no: 'לא', yes: 'כן', past: 'היה בעבר' };
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export const DEFAULT_TEMPLATES = [
  { id: 'welcome', title: 'ברוך הבא',
    text: 'היי {שם}, כאן GreekCloud. קיבלנו את הפנייה שלך לגבי הנסיעה ל{עיר}. מתי נוח לך לשיחה קצרה?' },
  { id: 'payment', title: 'תשלום',
    text: 'היי {שם}, מצרף כאן את פרטי התשלום למסלול {מסלול}. אחרי התשלום נמשיך לשלב הרופא. אם יש שאלה, אני כאן.' },
  { id: 'reminder', title: 'תזכורת לפני טיסה',
    text: 'היי {שם}, תזכורת קטנה: הטיסה שלך ל{עיר} ב-{תאריך_טיסה}. נעבור יחד על מה שנשאר לפני הנסיעה?' },
  { id: 'goodbye', title: 'טיסה טובה',
    text: 'היי {שם}, טיסה טובה ונסיעה נעימה! אם צריך משהו בדרך, פשוט לכתוב כאן.' },
];

/* ---------- dates ---------- */

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day in Israel for a Date or timestamp, as YYYY-MM-DD. */
export function isoDay(date) {
  return dayFmt.format(typeof date === 'number' ? new Date(date) : date);
}

export function isValidISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function daysUntil(iso, todayIso) {
  return dayNumber(iso) - dayNumber(todayIso);
}

function addDays(iso, n) {
  return new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!isValidISODate(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function monthOf(ts) {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? isoDay(t).slice(0, 7) : '';
}

export function ageOn(birthIso, todayIso) {
  if (!isValidISODate(birthIso)) return null;
  const [by, bm, bd] = birthIso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export function countdownLabel(flightIso, todayIso) {
  if (!isValidISODate(flightIso)) return '';
  const d = daysUntil(flightIso, todayIso);
  if (d === 0) return 'טס היום';
  if (d === 1) return 'טס מחר';
  if (d > 1) return `בעוד ${d} ימים`;
  if (d === -1) return 'טס אתמול';
  return `טס לפני ${-d} ימים`;
}

export function agoLabel(ts, nowMs) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((nowMs - t) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return mins === 1 ? 'לפני דקה' : `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
  const days = daysUntil(isoDay(nowMs), isoDay(t));
  if (days <= 1) return 'אתמול';
  if (days < 60) return `לפני ${days} ימים`;
  return formatDate(isoDay(t));
}

/* ---------- labels ---------- */

export function cityLabel(city) {
  const raw = String(city || '').trim();
  if (!raw) return '';
  const low = raw.toLowerCase();
  const hit = CITIES.find((c) => c.he === raw || c.en.toLowerCase() === low || c.alt.includes(low));
  if (hit) return hit.he;
  if (/^(אחר|other)/i.test(raw)) return 'עוד לא ידוע';
  return raw;
}

export const planLabel = (p) => PLAN_LABELS[p] || '';
export const rxLabel = (r) => RX_LABELS[r] || '';
export const sourceLabel = (s) => SOURCES[s] || 'לא ידוע';
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/* ---------- the merged client ---------- */

/** One client as the CRM shows it: the untouched submission plus our edits. */
export function mergeClient(id, record, crm, files) {
  const r = record || {};
  const c = crm || {};
  const arrival = isValidISODate(r.arrival) ? r.arrival : null;
  const flightUnknown = 'flightUnknown' in c ? !!c.flightUnknown : !!r.arrivalUnknown;
  const flightDate = flightUnknown ? null : ('flightDate' in c ? c.flightDate : arrival);
  return {
    id,
    receivedAt: r.receivedAt || null,
    entry: r.entry === 'manual' ? 'manual' : 'web',
    locale: r.locale === 'en' ? 'en' : 'he',
    plan: r.plan || '',
    fullName: r.fullName || '',
    phone: r.phone || '',
    email: r.email || '',
    passport: r.passport || '',
    birthdate: isValidISODate(r.birthdate) ? r.birthdate : null,
    age: Number.isInteger(r.age) ? r.age : null,
    city: r.city || '',
    condition: r.condition || '',
    rxExists: r.rxExists || '',
    consents: r.consents && typeof r.consents === 'object' ? r.consents : {},
    utm: r.utm || null,
    refHost: r.refHost || '',
    formArrival: arrival,
    flightDate: isValidISODate(flightDate) ? flightDate : null,
    flightUnknown,
    source: c.source || r.source || null,
    contacted: !!c.contacted,
    paid: !!c.paid,
    rxIssued: !!c.rxIssued,
    lost: c.lost && typeof c.lost === 'object' ? c.lost : null,
    notes: typeof c.notes === 'string' ? c.notes : '',
    seenAt: c.seenAt || null,
    stepsAt: c.stepsAt || {},
    history: Array.isArray(c.history) ? c.history : [],
    updatedAt: c.updatedAt || null,
    files: Array.isArray(files) ? files : [],
  };
}

/* ---------- stuck ---------- */

/** Why a client needs attention now. Empty means nothing is waiting on us. */
export function stuckReasons(cl, nowMs) {
  if (cl.lost) return [];
  const today = isoDay(nowMs);
  const out = [];
  if (cl.flightDate && daysUntil(cl.flightDate, today) < 0) return out;
  const received = Date.parse(cl.receivedAt);
  // A lead nobody answered for a month is cold, not stuck; keeping it here
  // forever would bury the ones that are still worth a call.
  if (!cl.contacted && Number.isFinite(received) && nowMs - received > DAY_MS && nowMs - received < 30 * DAY_MS) {
    out.push('no_contact');
  }
  if (cl.flightDate) {
    const d = daysUntil(cl.flightDate, today);
    if (d >= 0 && d <= 3) {
      if (!cl.paid) out.push('unpaid_soon');
      if (!cl.rxIssued) out.push('no_rx_soon');
    }
  }
  return out;
}

/* The privacy policy promises deletion 3 months after a request is closed. A
   trip that ended, or a lead marked not relevant, more than 90 days ago is due. */
export function retentionDue(cl, nowMs) {
  const today = isoDay(nowMs);
  if (cl.lost && cl.lost.at) {
    const t = Date.parse(cl.lost.at);
    if (Number.isFinite(t) && daysUntil(today, isoDay(t)) > 90) return true;
  }
  return !!(cl.flightDate && daysUntil(cl.flightDate, today) < -90);
}

/* ---------- filtering, search, grouping ---------- */

const digits = (s) => String(s || '').replace(/\D/g, '');

export function matchesQuery(cl, q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return true;
  const hay = [cl.fullName, cl.email, cl.passport, cityLabel(cl.city), cl.notes].join(' ').toLowerCase();
  if (hay.includes(query)) return true;
  const qd = digits(query);
  return qd.length >= 3 && (digits(cl.phone).includes(qd) || phoneKey(cl.phone).includes(qd.replace(/^0/, '')));
}

export function applyFilter(list, filter, nowMs) {
  switch (filter) {
    case 'active': return list.filter((c) => !c.lost);
    case 'stuck': return list.filter((c) => stuckReasons(c, nowMs).length > 0);
    case 'lost': return list.filter((c) => c.lost);
    case 'retention': return list.filter((c) => retentionDue(c, nowMs));
    default: return list.slice();
  }
}

const byReceivedDesc = (a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || ''));
const byFlightAsc = (a, b) => a.flightDate.localeCompare(b.flightDate) || byReceivedDesc(a, b);

export function groupByFlight(list, nowMs) {
  const today = isoDay(nowMs);
  const week = [], unknown = [], past = [];
  const months = new Map();
  for (const c of list) {
    if (!c.flightDate) { unknown.push(c); continue; }
    const d = daysUntil(c.flightDate, today);
    if (d < 0) past.push(c);
    else if (d <= 7) week.push(c);
    else {
      const k = c.flightDate.slice(0, 7);
      if (!months.has(k)) months.set(k, []);
      months.get(k).push(c);
    }
  }
  const groups = [];
  if (week.length) groups.push({ key: 'week', title: 'טסים השבוע', tone: 'hot', items: week.sort(byFlightAsc) });
  [...months.keys()].sort().forEach((k) => {
    groups.push({ key: k, title: monthLabel(k), items: months.get(k).sort(byFlightAsc) });
  });
  if (unknown.length) groups.push({ key: 'unknown', title: 'עוד לא יודעים מתי', items: unknown.sort(byReceivedDesc) });
  if (past.length) groups.push({ key: 'past', title: 'כבר טסו', collapsed: true, items: past.sort((a, b) => byFlightAsc(b, a)) });
  return groups;
}

export function groupByEntry(list, nowMs) {
  const today = isoDay(nowMs);
  const map = new Map();
  for (const c of list.slice().sort(byReceivedDesc)) {
    const day = c.receivedAt ? isoDay(Date.parse(c.receivedAt)) : '';
    let key, title;
    if (day === today) { key = 'today'; title = 'היום'; }
    else if (day && daysUntil(today, day) < 7) { key = 'week'; title = 'השבוע'; }
    else if (day) { key = day.slice(0, 7); title = monthLabel(key); }
    else { key = 'none'; title = 'ללא תאריך'; }
    if (!map.has(key)) map.set(key, { key, title, items: [] });
    map.get(key).items.push(c);
  }
  return [...map.values()];
}

/* ---------- returning clients ---------- */

/** A phone number reduced to its subscriber part, so 050-…, +972 50… and 97250… compare equal. */
export function phoneKey(p) {
  let d = digits(p);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d.length >= 8 ? d : '';
}

/** id -> other ids that share a phone or passport, newest first. */
export function relatedMap(list) {
  const buckets = new Map();
  const add = (k, c) => { if (!buckets.has(k)) buckets.set(k, new Set()); buckets.get(k).add(c); };
  for (const c of list) {
    const pk = phoneKey(c.phone);
    if (pk) add('p:' + pk, c);
    if (/^\d{8}$/.test(c.passport)) add('d:' + c.passport, c);
  }
  const out = new Map();
  for (const set of buckets.values()) {
    if (set.size < 2) continue;
    for (const c of set) {
      if (!out.has(c.id)) out.set(c.id, new Set());
      for (const o of set) if (o !== c) out.get(c.id).add(o);
    }
  }
  const res = new Map();
  for (const [id, set] of out) res.set(id, [...set].sort(byReceivedDesc).map((c) => c.id));
  return res;
}

/* ---------- copy, WhatsApp, calendar ---------- */

export function copyText(cl, { medical = true } = {}) {
  const lines = [];
  lines.push(`GreekCloud · נכנס ${cl.receivedAt ? formatDate(isoDay(Date.parse(cl.receivedAt))) : ''}`.trim());
  lines.push(`שם: ${cl.fullName}`);
  if (cl.phone) lines.push(`טלפון: ${cl.phone}`);
  if (cl.email) lines.push(`מייל: ${cl.email}`);
  if (medical && cl.passport) lines.push(`דרכון: ${cl.passport}`);
  if (medical && cl.birthdate) {
    const age = ageOn(cl.birthdate, isoDay(Date.now()));
    lines.push(`תאריך לידה: ${formatDate(cl.birthdate)}${age !== null ? ` (גיל ${age})` : ''}`);
  }
  if (cl.city) lines.push(`עיר ביוון: ${cityLabel(cl.city)}`);
  lines.push(`תאריך טיסה: ${cl.flightDate ? formatDate(cl.flightDate) : 'עוד לא ידוע'}`);
  if (cl.plan) lines.push(`מסלול: ${planLabel(cl.plan)}`);
  if (medical && cl.rxExists) lines.push(`מרשם קיים: ${rxLabel(cl.rxExists)}`);
  if (medical && cl.condition) lines.push('מצב רפואי:', cl.condition);
  return lines.join('\n');
}

/** International digits for wa.me; an Israeli local number gets 972. */
export function waPhone(p) {
  let d = digits(p);
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '972' + d.slice(1);
  return d.length >= 9 && d.length <= 15 ? d : '';
}

export function whatsappUrl(phone, text) {
  const n = waPhone(phone);
  if (!n) return '';
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function fillTemplate(text, cl) {
  const values = {
    'שם': firstName(cl.fullName),
    'שם_מלא': cl.fullName || '',
    'תאריך_טיסה': cl.flightDate ? formatDate(cl.flightDate) : 'בקרוב',
    'עיר': cityLabel(cl.city) || 'יוון',
    'מסלול': planLabel(cl.plan) || '',
  };
  return String(text || '').replace(/\{([^{}]+)\}/g, (m, k) => (k in values ? values[k] : m));
}

export function calendarUrl(cl, link) {
  if (!cl.flightDate) return '';
  const start = cl.flightDate.replace(/-/g, '');
  const end = addDays(cl.flightDate, 1).replace(/-/g, '');
  const city = cityLabel(cl.city);
  const title = `טיסה: ${firstName(cl.fullName)}${city && city !== 'עוד לא ידוע' ? ` ← ${city}` : ''}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${start}/${end}`, details: `GreekCloud CRM\n${link || ''}`.trim() });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/* ---------- smart paste ---------- */

const HE_MONTHS = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
const EN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const TRAVEL_WORDS = /(טס|טסה|טסים|טיסה|הטיסה|מגיע|מגיעה|נוחת|נוחתת|יוצא|יוצאת|נוסע|נוסעת|נסיעה|flight|fly|flying|arriv|land)/i;

function isoFrom(y, m, d) {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

function withYear(m, d, y, todayIso) {
  if (y) return isoFrom(y < 100 ? 2000 + y : y, m, d);
  const thisYear = Number(todayIso.slice(0, 4));
  const iso = isoFrom(thisYear, m, d);
  if (iso && daysUntil(iso, todayIso) < -7) return isoFrom(thisYear + 1, m, d);
  return iso;
}

function findDates(text, todayIso) {
  const found = [];
  const push = (iso, index) => { if (iso) found.push({ iso, index }); };
  let m;
  const numeric = /(?<!\d)(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?(?!\d)/g;
  while ((m = numeric.exec(text))) push(withYear(+m[2], +m[1], m[3] ? +m[3] : 0, todayIso), m.index);
  const he = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(?:ב|ל|של|ב-|ל-)?\\s*(${Object.keys(HE_MONTHS).join('|')})(?:\\s*(\\d{4}))?`, 'g');
  while ((m = he.exec(text))) push(withYear(HE_MONTHS[m[2]], +m[1], m[3] ? +m[3] : 0, todayIso), m.index);
  const en1 = /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/gi;
  while ((m = en1.exec(text))) push(withYear(EN_MONTHS[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : 0, todayIso), m.index);
  const en2 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/gi;
  while ((m = en2.exec(text))) push(withYear(EN_MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : 0, todayIso), m.index);
  return found;
}

function findCity(text) {
  const low = text.toLowerCase();
  for (const c of CITIES) {
    for (const a of c.alt) {
      const re = /[a-z]/.test(a)
        ? new RegExp(`\\b${a}\\b`, 'i')
        : new RegExp(`(?<![\\u0590-\\u05FF])[ולבמהש]?${a}(?![\\u0590-\\u05FF])`);
      if (re.test(low)) return c.he;
    }
  }
  return '';
}

function findName(text, lines) {
  const labeled = /(?:^|\n)\s*(?:שם(?:\s*מלא)?|name|full name)\s*[:\-–]\s*([^\n]+)/i.exec(text);
  if (labeled) return labeled[1].trim().slice(0, 80);
  const intro = /(?:קוראים לי|שמי|השם שלי|my name is|i am|i'm)\s+([^\n,.!?\d]+)/i.exec(text);
  if (intro) return intro[1].trim().split(/\s+/).slice(0, 3).join(' ');
  for (const raw of lines) {
    const line = raw.replace(/^(היי|הי|שלום|אהלן|hi|hello|hey)[\s,!.]*/i, '').trim();
    if (!line || /\d|@|:/.test(line) || line.length > 40) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && !TRAVEL_WORDS.test(line) && !findCity(line)) return line;
  }
  return '';
}

/** Best-effort fields from a pasted message. Every value is a suggestion the user reviews. */
export function parsePasted(input, nowMs) {
  const text = String(input || '').slice(0, 5000);
  const todayIso = isoDay(nowMs);
  const out = { fullName: '', phone: '', email: '', passport: '', city: '', flightDate: '' };

  const email = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}/i.exec(text);
  if (email) out.email = email[0];
  let rest = email ? text.replace(email[0], ' ') : text;

  // A run of digits can glue a phone to a neighbouring number ("Oct 5 054-…"),
  // so prefer the longest tail of the run that starts the way phones start.
  const valid = (s) => { const d = digits(s); return d.length >= 9 && d.length <= 15; };
  const phoneLike = (s) => /^(\+|0)/.test(s) || /^(972|30)/.test(digits(s));
  for (const m of rest.matchAll(/(?:\+|00)?\d[\d\-()\s]{7,24}\d/g)) {
    const tokens = m[0].trim().split(/\s+/);
    const tails = tokens.map((_, i) => tokens.slice(i).join(' ')).filter(valid);
    const piece = tails.find(phoneLike) || tails[0] || '';
    if (piece) {
      out.phone = piece;
      rest = rest.replace(piece, ' ');
      break;
    }
  }

  const passLabeled = /(?:דרכון|passport)[^\d\n]{0,12}(\d{8})(?!\d)/i.exec(rest);
  const passBare = /(?<![\d/.\-])\d{8}(?![\d/.\-])/.exec(rest);
  if (passLabeled) out.passport = passLabeled[1];
  else if (passBare) out.passport = passBare[0];
  if (out.passport) rest = rest.replace(out.passport, ' ');

  const dates = findDates(rest, todayIso).filter((d) => daysUntil(d.iso, todayIso) >= 0);
  const near = dates.find((d) => TRAVEL_WORDS.test(rest.slice(Math.max(0, d.index - 24), d.index)));
  const pick = near || dates.sort((a, b) => a.index - b.index)[0];
  if (pick) out.flightDate = pick.iso;

  out.city = findCity(text);
  out.fullName = findName(text, text.split(/\n+/));
  return out;
}

/* ---------- validation of what the browser sends ---------- */

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

export function sanitizePatch(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'bad_patch' };
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'contacted' || k === 'paid' || k === 'rxIssued' || k === 'flightUnknown') {
      if (typeof v !== 'boolean') return { ok: false, error: `bad:${k}` };
      out[k] = v;
    } else if (k === 'flightDate') {
      if (v !== null && !isValidISODate(v)) return { ok: false, error: 'bad:flightDate' };
      out[k] = v;
    } else if (k === 'source') {
      if (v !== null && !(v in SOURCES)) return { ok: false, error: 'bad:source' };
      out[k] = v;
    } else if (k === 'notes') {
      if (typeof v !== 'string' || v.length > 5000) return { ok: false, error: 'bad:notes' };
      out[k] = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    } else if (k === 'lost') {
      if (v === null) { out[k] = null; continue; }
      if (!v || typeof v !== 'object' || !(v.reason in LOST_REASONS)) return { ok: false, error: 'bad:lost' };
      out[k] = { reason: v.reason, note: str(v.note, 300) };
    } else if (k === 'seen') {
      if (v !== true) return { ok: false, error: 'bad:seen' };
      out[k] = true;
    } else {
      return { ok: false, error: `unknown:${k}` };
    }
  }
  if (!Object.keys(out).length) return { ok: false, error: 'empty_patch' };
  return { ok: true, patch: out };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Our edits after a patch, with step times and a short who-changed-what trail. */
export function applyPatch(crm, patch, by, nowIso) {
  const next = { ...(crm || {}) };
  const stepsAt = { ...(next.stepsAt || {}) };
  const history = Array.isArray(next.history) ? next.history.slice() : [];
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'seen') { if (!next.seenAt) { next.seenAt = nowIso; changed = true; } continue; }
    let unchanged;
    if (k === 'lost') unchanged = v ? !!(next.lost && next.lost.reason === v.reason && next.lost.note === v.note) : !next.lost;
    else if (k === 'flightDate' || k === 'source') unchanged = Object.prototype.hasOwnProperty.call(next, k) && same(next[k], v);
    else if (k === 'notes') unchanged = (next.notes || '') === v;
    else unchanged = !!next[k] === v;
    if (unchanged) continue;
    next[k] = k === 'lost' && v ? { ...v, at: nowIso } : v;
    changed = true;
    if (k in STEPS) { if (v) stepsAt[k] = nowIso; else delete stepsAt[k]; }
    const top = history[0];
    if (k === 'notes' && top && top.field === 'notes' && top.by === by && Date.parse(nowIso) - Date.parse(top.at) < 10 * 60000) {
      top.at = nowIso;
    } else {
      history.unshift({ at: nowIso, by, field: k, value: k === 'notes' ? null : next[k] });
    }
  }
  if (!changed) return next;
  next.stepsAt = stepsAt;
  next.history = history.slice(0, 50);
  next.updatedAt = nowIso;
  return next;
}

export function historyText(h) {
  switch (h.field) {
    case 'contacted': case 'paid': case 'rxIssued':
      return `${h.value ? 'סימן' : 'ביטל'} "${STEPS[h.field]}"`;
    case 'lost':
      return h.value ? `סימן לא רלוונטי (${LOST_REASONS[h.value.reason] || ''})` : 'החזיר לפעילים';
    case 'flightDate': return h.value ? `שינה תאריך טיסה ל-${formatDate(h.value)}` : 'מחק תאריך טיסה';
    case 'flightUnknown': return h.value ? 'סימן "עוד לא יודע מתי"' : 'ביטל "עוד לא יודע מתי"';
    case 'source': return `שינה מקור הגעה ל${sourceLabel(h.value)}`;
    case 'notes': return 'עדכן הערות';
    default: return 'עדכון';
  }
}

export function newSubmissionId(nowMs) {
  const rand = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}-${rand}`;
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** A client typed in by hand. Returns the record and our first edits, or an error key. */
export function sanitizeManual(input, nowMs) {
  const i = input && typeof input === 'object' ? input : {};
  const fullName = str(i.fullName, 120);
  const phone = str(i.phone, 32);
  if (!fullName) return { ok: false, error: 'missing:fullName' };
  if (digits(phone).length < 9) return { ok: false, error: 'missing:phone' };
  const email = str(i.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad:email' };
  const passport = digits(str(i.passport, 20));
  const flightDate = isValidISODate(i.flightDate) ? i.flightDate : '';
  const plan = i.plan === 'vip' || i.plan === 'standard' ? i.plan : '';
  const source = i.source in SOURCES ? i.source : null;
  const nowIso = new Date(nowMs).toISOString();
  const record = {
    submissionId: newSubmissionId(nowMs), receivedAt: nowIso, entry: 'manual', locale: 'he',
    plan, fullName, phone, email, passport, city: str(i.city, 60),
    arrival: flightDate, arrivalUnknown: !flightDate && !!i.flightUnknown,
    condition: str(i.condition, 4000),
  };
  let crm = { source, seenAt: nowIso };
  const notes = str(i.notes, 5000);
  if (notes) crm.notes = notes;
  if (i.contacted) crm = applyPatch(crm, { contacted: true }, str(i.by, 254) || 'system', nowIso);
  return { ok: true, record, crm };
}

export function sanitizeTemplates(list) {
  if (!Array.isArray(list) || list.length > 12) return { ok: false, error: 'bad_templates' };
  const out = [];
  for (const t of list) {
    const title = str(t && t.title, 40);
    const text = typeof (t && t.text) === 'string' ? t.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000) : '';
    if (!title || !text) return { ok: false, error: 'bad_template' };
    const id = /^[a-z0-9_-]{1,32}$/.test(t.id) ? t.id : `t${out.length + 1}`;
    out.push({ id, title, text });
  }
  return { ok: true, templates: out };
}

export function sanitizeUsers(list, adminEmail) {
  if (!Array.isArray(list) || list.length > 10) return { ok: false, error: 'bad_users' };
  const admin = String(adminEmail || '').toLowerCase();
  const seen = new Set();
  const out = [];
  for (const u of list) {
    const email = str(u && u.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_email' };
    if (email === admin || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, role: u.role === 'admin' ? 'admin' : 'member' });
  }
  return { ok: true, users: out };
}

/* ---------- where a lead came from ---------- */

export function classifySource({ utmSource, refHost } = {}) {
  const s = String(utmSource || '').toLowerCase();
  const r = String(refHost || '').toLowerCase();
  const test = (utm, host) => utm.test(s) || host.test(r);
  if (test(/google|adwords|gclid/, /(^|\.)google\./)) return 'google';
  if (test(/facebook|^fb$|meta/, /(^|\.)(facebook\.com|fb\.com|fb\.me)$/)) return 'facebook';
  if (test(/instagram|^ig$/, /(^|\.)instagram\.com$/)) return 'instagram';
  if (test(/tiktok/, /(^|\.)tiktok\.com$/)) return 'tiktok';
  if (test(/whatsapp|^wa$/, /(^|\.)(whatsapp\.com|wa\.me)$/)) return 'whatsapp';
  if (test(/chatgpt|openai|perplexity|claude|gemini|copilot/, /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/)) return 'ai';
  if (!s && !r) return 'direct';
  return 'other';
}

/* ---------- export ---------- */

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = (/^[+\-][\d\s\-()]+$/.test(s) ? '‎' : "'") + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(list, { medical = false } = {}) {
  const cols = [
    ['נכנס', (c) => (c.receivedAt ? formatDate(isoDay(Date.parse(c.receivedAt))) : '')],
    ['שם', (c) => c.fullName],
    ['טלפון', (c) => c.phone],
    ['מייל', (c) => c.email],
    ['עיר', (c) => cityLabel(c.city)],
    ['תאריך טיסה', (c) => (c.flightDate ? formatDate(c.flightDate) : c.flightUnknown ? 'לא ידוע' : '')],
    ['מסלול', (c) => planLabel(c.plan)],
    ['מקור', (c) => (c.source ? sourceLabel(c.source) : '')],
    ['נוצר קשר', (c) => (c.contacted ? 'כן' : '')],
    ['שולם', (c) => (c.paid ? 'כן' : '')],
    ['מרשם יצא', (c) => (c.rxIssued ? 'כן' : '')],
    ['לא רלוונטי', (c) => (c.lost ? LOST_REASONS[c.lost.reason] || 'כן' : '')],
    ['הערות', (c) => c.notes],
  ];
  if (medical) {
    cols.push(['דרכון', (c) => c.passport], ['תאריך לידה', (c) => formatDate(c.birthdate)],
      ['מרשם קיים', (c) => rxLabel(c.rxExists)], ['מצב רפואי', (c) => c.condition]);
  }
  const rows = [cols.map((c) => csvCell(c[0])).join(',')];
  for (const cl of list) rows.push(cols.map(([, f]) => csvCell(f(cl))).join(','));
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/* ---------- stats ---------- */

function countBy(list, key, label) {
  const m = new Map();
  for (const c of list) {
    const k = key(c);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, label: label(k), count })).sort((a, b) => b.count - a.count);
}

export function computeStats(list, nowMs) {
  const month = isoDay(nowMs).slice(0, 7);
  const today = isoDay(nowMs);
  const leadsMonth = list.filter((c) => monthOf(c.receivedAt) === month);
  const paidMonth = list.filter((c) => c.paid && monthOf(c.stepsAt.paid || c.receivedAt) === month);
  const flyingMonth = list.filter((c) => !c.lost && c.flightDate && c.flightDate.slice(0, 7) === month);
  const paidAll = list.filter((c) => c.paid).length;
  const recent = list.filter((c) => {
    const t = Date.parse(c.receivedAt);
    return Number.isFinite(t) && daysUntil(today, isoDay(t)) <= 90;
  });
  const byCity = countBy(recent, (c) => { const l = cityLabel(c.city); return l && l !== 'עוד לא ידוע' ? l : ''; }, (k) => k);

  const months = [];
  const [y, m] = month.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const inMonth = list.filter((c) => monthOf(c.receivedAt) === key);
    months.push({ key, label: MONTHS[d.getUTCMonth()], leads: inMonth.length, paid: inMonth.filter((c) => c.paid).length });
  }

  return {
    leadsMonth: leadsMonth.length,
    paidMonth: paidMonth.length,
    flyingMonth: flyingMonth.length,
    conversion: list.length ? Math.round((paidAll / list.length) * 100) : 0,
    topCity: byCity[0] ? byCity[0].label : '',
    months,
    byCity,
    bySource: countBy(list, (c) => c.source || 'unknown', (k) => (k === 'unknown' ? 'לא ידוע' : sourceLabel(k))),
    lostReasons: countBy(list.filter((c) => c.lost), (c) => c.lost.reason, (k) => LOST_REASONS[k] || k),
  };
}
