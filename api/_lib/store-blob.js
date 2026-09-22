import { list, get, put, del, BlobPreconditionFailedError } from '@vercel/blob';

/* The CRM's only storage: the same private Blob store the intake form writes to.
   Everything above this file talks to the small interface below, so tests and the
   local dev server can swap in the in-memory version. */

function conflict() {
  return Object.assign(new Error('conflict'), { code: 'conflict' });
}

export function blobStore() {
  return {
    async list(prefix) {
      const out = [];
      let cursor;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        for (const b of page.blobs) out.push({ pathname: b.pathname, etag: b.etag, uploadedAt: b.uploadedAt });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },

    async getJSON(pathname, { cached = false } = {}) {
      const res = await get(pathname, { access: 'private', useCache: cached });
      if (!res || res.statusCode !== 200) return null;
      const text = await new Response(res.stream).text();
      return { data: JSON.parse(text), etag: res.blob.etag };
    },

    async putJSON(pathname, data, { ifMatch } = {}) {
      try {
        const res = await put(pathname, JSON.stringify(data), {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'application/json',
          ...(ifMatch ? { ifMatch } : { allowOverwrite: true }),
        });
        return { etag: res.etag };
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw conflict();
        throw e;
      }
    },

    async getFile(pathname) {
      const res = await get(pathname, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return { stream: res.stream, contentType: res.blob.contentType, size: res.blob.size };
    },

    async delMany(pathnames) {
      if (pathnames.length) await del(pathnames);
    },
  };
}
