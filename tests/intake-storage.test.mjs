/* Where a submission ends up, and what happens when that fails.
   ---------------------------------------------------------------------------
   Two properties matter here and neither is visible from reading the happy
   path alone:

     1. In normal operation nothing is duplicated. Supabase holds the files,
        the bridge files the record, and Vercel Blob is never written to. The
        whole reason for consolidating was one deletion instead of two, and a
        stray Blob write would quietly undo that.

     2. A submission is never lost. If Supabase or the bridge refuses, the
        visitor's answers are parked where an operator can recover them, and
        the reply says pending rather than received.

   Both collaborators are stubbed, so nothing leaves the process. */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const calls = { blobPuts: [], uploads: [], sends: [], bridge: [] };
let uploadFails = false;
let blobFails = false;
let bridgeResult = { status: "synced", caseId: "case-1" };

register(
  "data:text/javascript," +
    encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === '@vercel/blob') return { url: 'stub:blob', shortCircuit: true, format: 'module' };
      if (spec === 'resend') return { url: 'stub:resend', shortCircuit: true, format: 'module' };
      if (spec.endsWith('/intake-store.js')) return { url: 'stub:store', shortCircuit: true, format: 'module' };
      if (spec.endsWith('/crm-sync.js')) return { url: 'stub:sync', shortCircuit: true, format: 'module' };
      return next(spec, ctx);
    }
    export async function load(url, ctx, next) {
      if (url === 'stub:blob') return { format: 'module', shortCircuit: true,
        source: "export const put = (...a) => globalThis.__s.put(...a);" };
      if (url === 'stub:resend') return { format: 'module', shortCircuit: true,
        source: "export class Resend { constructor() { this.emails = { send: (...a) => globalThis.__s.send(...a) }; } }" };
      if (url === 'stub:store') return { format: 'module', shortCircuit: true,
        source: "export const intakeStorageConfigured = () => globalThis.__s.configured();"
              + "export const putIntakeFile = (...a) => globalThis.__s.upload(...a);" };
      if (url === 'stub:sync') return { format: 'module', shortCircuit: true,
        source: "export const crmContactPayload = (r) => globalThis.__s.payload(r);"
              + "export const syncCrmContact = (...a) => globalThis.__s.bridge(...a);" };
      return next(url, ctx);
    }
  `),
  pathToFileURL("./"),
);

globalThis.__s = {
  configured: () => !uploadFails || true,
  put: async (path, body, opts) => {
    if (blobFails) throw new Error("blob down");
    calls.blobPuts.push({ path, opts });
    return { pathname: path };
  },
  upload: async (submissionId, name) => {
    if (uploadFails) throw new Error("storage_upload_failed: down");
    const path = `submissions/${submissionId}/${name}`;
    calls.uploads.push(path);
    return path;
  },
  payload: (record) => ({ submissionId: record.submissionId, selfiePath: record.selfiePath }),
  bridge: async (payload) => {
    calls.bridge.push(payload);
    return bridgeResult;
  },
  send: async (msg) => {
    calls.sends.push(msg);
    return { data: { id: "email_1" }, error: null };
  },
};

process.env.RESEND_API_KEY = "test";
process.env.BLOB_READ_WRITE_TOKEN = "test";
process.env.LEAD_NOTIFY_EMAIL = "ops@example.test";

const handler = (await import("../api/submit.js")).default;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0]);
const VALID = {
  locale: "he", plan: "standard", full_name: "TEST VISITOR", passport: "12345678",
  age: "41", email: "test@example.test", phone: "+972-50-0000000", city: "אתונה",
  arrival: "2026-09-16", condition: "test condition", rx_exists: "no",
  c_age: "on", c_terms: "on", c_health: "on", c_customs: "on", c_nopromise: "on",
  c_accuracy: "on", c_liability: "on",
};

function post() {
  const form = new FormData();
  for (const [k, v] of Object.entries(VALID)) form.append(k, v);
  form.append("file_selfie", new File([JPEG], "selfie.jpg", { type: "image/jpeg" }));
  return handler.fetch(new Request("https://example.test/api/submit", { method: "POST", body: form }));
}

beforeEach(() => {
  calls.blobPuts.length = 0;
  calls.uploads.length = 0;
  calls.sends.length = 0;
  calls.bridge.length = 0;
  uploadFails = false;
  blobFails = false;
  bridgeResult = { status: "synced", caseId: "case-1" };
});

test("the normal path writes to Supabase only -- Blob is never touched", async () => {
  const res = await post();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(calls.uploads.length, 1, "the selfie went to Supabase");
  assert.match(calls.uploads[0], /^submissions\/.+\/selfie\.jpg$/);
  assert.deepEqual(calls.blobPuts, [], "nothing was duplicated into Blob");
  assert.equal(calls.bridge.length, 1, "the record was filed through the bridge");
  assert.equal(calls.sends.length, 1);
});

test("when storage refuses, the submission is parked rather than lost", async () => {
  uploadFails = true;
  const res = await post();

  assert.equal(res.status, 202, "pending, not received");
  const body = await res.json();
  assert.equal(body.pending, true);
  assert.ok(body.submissionId);

  const parked = calls.blobPuts.map((p) => p.path);
  assert.ok(parked.some((p) => p.startsWith("unreceived/")), `parked: ${parked}`);
  assert.ok(parked.some((p) => p.endsWith("/record.json")), "the answers are kept");
  assert.ok(parked.some((p) => p.endsWith("/selfie.jpg")), "so is the file");
  assert.equal(calls.bridge.length, 0, "the bridge is not called with no file stored");
  assert.equal(calls.sends.length, 0, "no notification claims a received request");
});

test("when the bridge refuses, the record is parked but the file is not re-uploaded", async () => {
  bridgeResult = { status: "pending", code: "http_503" };
  const res = await post();

  assert.equal(res.status, 202);
  assert.equal(calls.uploads.length, 1, "the file did reach Supabase");
  const parked = calls.blobPuts.map((p) => p.path);
  assert.ok(parked.some((p) => p.endsWith("/record.json")), "the record is recoverable");
  assert.ok(
    !parked.some((p) => p.endsWith("/selfie.jpg")),
    "the file is already stored, so it is not copied a second time",
  );
});

test("if both stores refuse, the visitor is told it was not stored", async () => {
  uploadFails = true;
  blobFails = true;
  const res = await post();

  assert.equal(res.status, 503, "never a success reply for something not stored");
  assert.equal((await res.json()).error, "not_stored");
  assert.equal(calls.sends.length, 0);
});

test("a parked submission records why, so recovery is not guesswork", async () => {
  bridgeResult = { status: "pending", code: "http_503" };
  await post();
  const record = calls.blobPuts.find((p) => p.path.endsWith("/record.json"));
  assert.ok(record, "a record was parked");
  assert.equal(record.opts.access, "private", "parked data is never public");
});
