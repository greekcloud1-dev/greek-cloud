/* In-memory stand-in for the Blob store, for tests and the local dev server. */

export function memoryStore(seed = {}) {
  const files = new Map();
  let n = 0;
  const etag = () => `"e${++n}"`;
  const set = (pathname, body, contentType) => {
    const e = etag();
    files.set(pathname, { body, contentType, etag: e, uploadedAt: new Date() });
    return e;
  };
  for (const [p, v] of Object.entries(seed)) {
    if (typeof v === 'string' || v instanceof Uint8Array) set(p, v, p.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    else set(p, JSON.stringify(v), 'application/json');
  }

  return {
    files,
    ops: { list: 0, get: 0, put: 0 },

    async list(prefix) {
      this.ops.list++;
      return [...files.entries()]
        .filter(([p]) => p.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pathname, f]) => ({ pathname, etag: f.etag, uploadedAt: f.uploadedAt }));
    },

    async getJSON(pathname) {
      this.ops.get++;
      const f = files.get(pathname);
      return f ? { data: JSON.parse(f.body), etag: f.etag } : null;
    },

    async putJSON(pathname, data, { ifMatch, create } = {}) {
      this.ops.put++;
      if ((ifMatch && files.get(pathname)?.etag !== ifMatch) || (create && files.has(pathname))) {
        throw Object.assign(new Error('conflict'), { code: 'conflict' });
      }
      return { etag: set(pathname, JSON.stringify(data), 'application/json') };
    },

    async getFile(pathname) {
      const f = files.get(pathname);
      if (!f) return null;
      const bytes = typeof f.body === 'string' ? new TextEncoder().encode(f.body) : f.body;
      return { stream: new Blob([bytes]).stream(), contentType: f.contentType, size: bytes.length };
    },

    async delMany(pathnames) {
      for (const p of pathnames) files.delete(p);
    },
  };
}
