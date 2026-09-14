/* The signed link that lets the CRM show a stored selfie or prescription.
   ---------------------------------------------------------------------------
   These files are somebody's face and medical paperwork, and this endpoint is
   the only way to reach them from outside the website. Everything worth
   asserting here is about refusal: an edited link, an expired one, a forged
   one, and anything shaped like a path.

   @vercel/blob is stubbed, so a passing signature reaches a recorder rather
   than real storage and nothing leaves the process. */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const reads = [];
register(
  "data:text/javascript," +
    encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === '@vercel/blob') return { url: 'stub:blob', shortCircuit: true, format: 'module' };
      return next(spec, ctx);
    }
    export async function load(url, ctx, next) {
      if (url === 'stub:blob') return {
        format: 'module', shortCircuit: true,
        source: "export const get = (...a) => globalThis.__blob.get(...a);",
      };
      return next(url, ctx);
    }
  `),
  pathToFileURL("./"),
);

globalThis.__blob = {
  get: async (pathname) => {
    reads.push(pathname);
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("bytes"));
          controller.close();
        },
      }),
      headers: new Headers({ "content-type": "image/jpeg" }),
    };
  },
};

const SECRET = "x".repeat(40);
process.env.INTAKE_FILE_SECRET = SECRET;
process.env.BLOB_READ_WRITE_TOKEN = "test";

const handler = (await import("../api/intake-file.js")).default;

const SID = "2026-09-14T10-00-00-000Z-abcdef0123456789";

/** Mint a link the way the CRM route does. */
function link({
  submissionId = SID,
  file = "selfie",
  name = "selfie.jpg",
  expires = Date.now() + 60_000,
  secret = SECRET,
  tamper = {},
} = {}) {
  const signature = createHmac("sha256", secret)
    .update([submissionId, file, name, String(expires)].join("\n"))
    .digest("hex");
  const url = new URL("https://example.test/api/intake-file");
  const params = {
    sid: submissionId,
    f: file,
    n: name,
    exp: String(expires),
    sig: signature,
    ...tamper,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

const call = (url, method = "GET") => handler.fetch(new Request(url, { method }));

beforeEach(() => {
  reads.length = 0;
});

test("a valid link streams the file and nothing else", async () => {
  const res = await call(link());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("cache-control"), "no-store, private");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(reads, [`submissions/${SID}/selfie.jpg`]);
});

/* The whole point of signing all four parts together: holding one link must not
   let you construct another. */
for (const [label, tamper] of [
  ["a different submission", { sid: "2026-09-14T10-00-00-000Z-9999999999999999" }],
  ["the other file", { f: "rx" }],
  ["a different basename", { n: "prescription.pdf" }],
  ["a pushed-out expiry", { exp: String(Date.now() + 86_400_000) }],
]) {
  test(`refuses ${label} on an otherwise valid link`, async () => {
    const res = await call(link({ tamper }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "bad_signature");
    assert.equal(reads.length, 0, "storage is never touched");
  });
}

test("refuses a link signed with the wrong secret", async () => {
  const res = await call(link({ secret: "y".repeat(40) }));
  assert.equal(res.status, 403);
  assert.equal(reads.length, 0);
});

test("refuses an expired link even though its signature is valid", async () => {
  const res = await call(link({ expires: Date.now() - 1 }));
  assert.equal(res.status, 410);
  assert.equal((await res.json()).error, "link_expired");
  assert.equal(reads.length, 0);
});

test("refuses a link with no signature at all", async () => {
  const url = new URL(link());
  url.searchParams.delete("sig");
  assert.equal((await call(url.toString())).status, 403);
  assert.equal(reads.length, 0);
});

/* A name is a bare filename. Nothing that could name a path is accepted, and
   the check happens before any storage call. */
for (const name of [
  "../selfie.jpg",
  "..%2Fselfie.jpg",
  "sub/selfie.jpg",
  "/etc/passwd",
  "selfie.jpg\u0000.txt",
  "selfie.jpg\n",
  "selfie",
  "",
]) {
  test(`refuses the basename ${JSON.stringify(name)}`, async () => {
    const res = await call(link({ name }));
    assert.ok(res.status === 400 || res.status === 403, `got ${res.status}`);
    assert.equal(reads.length, 0, "storage is never touched");
  });
}

test("refuses a submission id that is not one", async () => {
  for (const sid of ["../../etc", "short", "a".repeat(200), ""]) {
    const res = await call(link({ submissionId: sid }));
    assert.ok(res.status === 400 || res.status === 403, `${sid} -> ${res.status}`);
  }
  assert.equal(reads.length, 0);
});

test("a basename must belong to the file it claims to be", async () => {
  // Correctly signed, but names the prescription while asking for the selfie.
  const res = await call(link({ file: "selfie", name: "prescription.pdf" }));
  assert.equal(res.status, 400);
  assert.equal(reads.length, 0);
});

test("refuses a file kind outside the two-item enum", async () => {
  const res = await call(link({ file: "record" }));
  assert.equal(res.status, 400);
  assert.equal(reads.length, 0);
});

test("refuses methods that are not a read", async () => {
  for (const method of ["POST", "DELETE", "PUT"]) {
    const res = await call(link(), method);
    assert.equal(res.status, 405);
  }
  assert.equal(reads.length, 0);
});

test("no response carries the secret, a storage path or a Blob URL", async () => {
  for (const url of [link(), link({ tamper: { sig: "deadbeef" } }), link({ expires: 1 })]) {
    const res = await call(url);
    if (res.status === 200) continue;
    const body = await res.text();
    assert.ok(!body.includes(SECRET), "the secret never appears");
    assert.ok(!body.includes("submissions/"), "no storage path");
    assert.ok(!body.includes("blob.vercel-storage"), "no Blob host");
  }
});

test("without configuration it refuses rather than serving anything", async () => {
  const previous = process.env.INTAKE_FILE_SECRET;
  process.env.INTAKE_FILE_SECRET = "too-short";
  const res = await call(link());
  assert.equal(res.status, 503);
  assert.equal(reads.length, 0);
  process.env.INTAKE_FILE_SECRET = previous;
});
