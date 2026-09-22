import {
  mergeClient, sanitizePatch, applyPatch, sanitizeManual, sanitizeTemplates, sanitizeUsers,
  toCSV, DEFAULT_TEMPLATES, ID_PATTERN, isoDay,
} from '../../crm/core.js';
import {
  SESSION_COOKIE, sessionConfigured, verifyToken, parseCookies, clearCookie, roleFor,
} from './session.js';
import { loadClients } from './clients.js';

const MAX_BODY = 64 * 1024;
const FILE_NAME = /^[a-z]+\.(jpg|jpeg|png|webp|heic|pdf)$/;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status, body, extra = {}) {
  const headers = new Headers({ ...HEADERS, ...extra });
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: json(413, { ok: false, error: 'too_large' }) };
  try { return { body: JSON.parse(text || '{}') }; } catch { return { error: json(400, { ok: false, error: 'bad_json' }) }; }
}

async function loadTemplates(store) {
  const t = await store.getJSON('crm/templates.json').catch(() => null);
  return t && Array.isArray(t.data?.templates) && t.data.templates.length ? t.data.templates : DEFAULT_TEMPLATES;
}

export function createCrmHandler({ env, store, now = () => Date.now() }) {
  async function patchClient(id, patch, by) {
    const recPath = `submissions/${id}/record.json`;
    const crmPath = `submissions/${id}/crm.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [rec, cur] = await Promise.all([store.getJSON(recPath, { cached: true }), store.getJSON(crmPath)]);
      if (!rec) return null;
      const next = applyPatch(cur ? cur.data : {}, patch, by, new Date(now()).toISOString());
      try {
        await store.putJSON(crmPath, next, cur ? { ifMatch: cur.etag } : {});
        return mergeClient(id, rec.data, next, []);
      } catch (e) {
        if (e.code !== 'conflict') throw e;
      }
    }
    throw Object.assign(new Error('busy'), { code: 'busy' });
  }

  return async function handle(request) {
    if (!sessionConfigured(env)) return json(503, { ok: false, error: 'not_configured' });

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const method = request.method;

    // Every write must come from our own page. SameSite=Strict already keeps the
    // cookie off cross-site requests; this makes the rule explicit.
    if (method === 'POST' && request.headers.get('origin') !== url.origin) {
      return json(403, { ok: false, error: 'origin' });
    }

    if (action === 'logout' && method === 'POST') {
      return json(200, { ok: true }, { 'set-cookie': clearCookie(SESSION_COOKIE) });
    }

    const session = verifyToken(parseCookies(request.headers.get('cookie'))[SESSION_COOKIE], env.CRM_SESSION_SECRET, now());
    if (!session) return json(401, { ok: false, error: 'unauthenticated' });
    // Re-checked on every request, so removing someone takes effect at once.
    const role = await roleFor(session.email, env, store);
    if (!role) return json(401, { ok: false, error: 'revoked' }, { 'set-cookie': clearCookie(SESSION_COOKIE) });
    const me = { email: session.email, role };
    const admin = role === 'admin';
    const is = (a, m) => action === a && method === m;

    try {
      if (is('me', 'GET')) return json(200, { ok: true, me });

      if (is('list', 'GET')) {
        const [clients, templates] = await Promise.all([loadClients(store), loadTemplates(store)]);
        return json(200, { ok: true, me, now: now(), clients, templates });
      }

      if (is('patch', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        if (!ID_PATTERN.test(body.id || '')) return json(400, { ok: false, error: 'bad_id' });
        const clean = sanitizePatch(body.patch);
        if (!clean.ok) return json(400, { ok: false, error: clean.error });
        const client = await patchClient(body.id, clean.patch, me.email);
        if (!client) return json(404, { ok: false, error: 'not_found' });
        return json(200, { ok: true, client });
      }

      if (is('create', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        const clean = sanitizeManual({ ...(body.client || {}), by: me.email }, now());
        if (!clean.ok) return json(400, { ok: false, error: clean.error });
        const id = clean.record.submissionId;
        await store.putJSON(`submissions/${id}/record.json`, clean.record);
        await store.putJSON(`submissions/${id}/crm.json`, clean.crm);
        return json(200, { ok: true, client: mergeClient(id, clean.record, clean.crm, []) });
      }

      if (is('file', 'GET')) {
        const id = url.searchParams.get('id') || '';
        const name = url.searchParams.get('name') || '';
        const m = FILE_NAME.exec(name);
        if (!ID_PATTERN.test(id) || !m) return json(400, { ok: false, error: 'bad_file' });
        const file = await store.getFile(`submissions/${id}/${name}`);
        if (!file) return json(404, { ok: false, error: 'not_found' });
        const pdf = m[1] === 'pdf';
        return new Response(file.stream, {
          status: 200,
          headers: {
            'content-type': file.contentType || 'application/octet-stream',
            // A PDF downloads rather than opening under the API's locked-down CSP.
            'content-disposition': `${pdf ? 'attachment' : 'inline'}; filename="${name}"`,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      }

      if (is('templates', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        const clean = sanitizeTemplates(body.templates);
        if (!clean.ok) return json(400, { ok: false, error: clean.error });
        await store.putJSON('crm/templates.json', { templates: clean.templates, updatedAt: new Date(now()).toISOString(), by: me.email });
        return json(200, { ok: true, templates: clean.templates });
      }

      if (!admin && ['delete', 'export', 'users'].includes(action)) return json(403, { ok: false, error: 'admin_only' });

      if (is('delete', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        if (!ID_PATTERN.test(body.id || '')) return json(400, { ok: false, error: 'bad_id' });
        const blobs = await store.list(`submissions/${body.id}/`);
        if (!blobs.length) return json(404, { ok: false, error: 'not_found' });
        await store.delMany(blobs.map((b) => b.pathname));
        return json(200, { ok: true, deleted: blobs.length });
      }

      if (is('export', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        const ids = new Set(Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : []);
        const clients = (await loadClients(store))
          .filter((c) => ids.has(c.id))
          .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
        return new Response(toCSV(clients, { medical: body.medical === true }), {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="greekcloud-clients-${isoDay(now())}.csv"`,
            'cache-control': 'no-store',
          },
        });
      }

      if (is('users', 'GET')) {
        const f = await store.getJSON('crm/users.json');
        return json(200, { ok: true, adminEmail: String(env.CRM_ADMIN_EMAIL || '').toLowerCase(), users: f?.data?.users || [] });
      }

      if (is('users', 'POST')) {
        const { body, error } = await readBody(request);
        if (error) return error;
        const clean = sanitizeUsers(body.users, env.CRM_ADMIN_EMAIL);
        if (!clean.ok) return json(400, { ok: false, error: clean.error });
        await store.putJSON('crm/users.json', { users: clean.users, updatedAt: new Date(now()).toISOString(), by: me.email });
        return json(200, { ok: true, users: clean.users });
      }

      return json(404, { ok: false, error: 'unknown_action' });
    } catch (e) {
      console.error('crm action failed', action, e);
      return json(e.code === 'busy' ? 409 : 502, { ok: false, error: e.code === 'busy' ? 'busy' : 'storage_failed' });
    }
  };
}
