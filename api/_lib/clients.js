import { mergeClient, INDEX_VERSION, ID_PATTERN } from '../../crm/core.js';

export const INDEX_PATH = 'crm/index.json';
const FILE_NAME = /^[a-z]+\.(?:jpg|jpeg|png|webp|heic|pdf)$/;

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

/** submissions/<id>/<name> blobs grouped per client. */
export function groupBlobs(blobs) {
  const byId = new Map();
  for (const b of blobs) {
    const m = /^submissions\/([^/]+)\/([^/]+)$/.exec(b.pathname);
    if (!m || !ID_PATTERN.test(m[1])) continue;
    const [, id, name] = m;
    if (!byId.has(id)) byId.set(id, { record: null, crm: null, files: [] });
    const g = byId.get(id);
    if (name === 'record.json') g.record = b.etag;
    else if (name === 'crm.json') g.crm = b.etag;
    else if (FILE_NAME.test(name)) g.files.push(name);
  }
  return byId;
}

/* Every client, merged. The per-client files stay the source of truth; the index
   is only a cache keyed by their etags, so one list call plus one read serves a
   normal page load instead of two reads per client. A stale or missing index
   costs speed, never data. */
export async function loadClients(store) {
  const [blobs, idx] = await Promise.all([
    store.list('submissions/'),
    store.getJSON(INDEX_PATH).catch(() => null),
  ]);
  const cached = idx && idx.data && idx.data.v === INDEX_VERSION ? idx.data.entries || {} : {};
  const groups = groupBlobs(blobs);
  const entries = {};
  const todo = [];
  for (const [id, g] of groups) {
    if (!g.record) continue;
    const key = `${g.record}|${g.crm || ''}|${g.files.slice().sort().join(',')}`;
    if (cached[id] && cached[id].key === key) entries[id] = cached[id];
    else todo.push({ id, g, key });
  }
  const changed = todo.length > 0 || Object.keys(cached).some((id) => !(id in entries));

  await mapLimit(todo, 8, async ({ id, g, key }) => {
    const [rec, crm] = await Promise.all([
      store.getJSON(`submissions/${id}/record.json`, { cached: true }).catch(() => null),
      g.crm ? store.getJSON(`submissions/${id}/crm.json`).catch(() => null) : null,
    ]);
    if (!rec) return;
    entries[id] = { key, client: mergeClient(id, rec.data, crm && crm.data, g.files) };
  });

  if (changed) {
    try { await store.putJSON(INDEX_PATH, { v: INDEX_VERSION, builtAt: new Date().toISOString(), entries }); } catch { /* cache only */ }
  }
  return Object.values(entries).map((e) => e.client);
}
