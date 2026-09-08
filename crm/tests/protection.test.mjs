import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Execute the actual pure boundary helpers; only Next's server-only marker is removed.
const source = (
  await readFile(
    new URL("../lib/request/protection.ts", import.meta.url),
    "utf8",
  )
).replace('import "server-only";', "");
const protection = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);
const request = (body, headers = {}) =>
  new Request("https://crm.example.com/api/leads", {
    method: "POST",
    body,
    headers,
  });

test("CSRF refuses absent, foreign, cross-site and host-spoofed origins", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://crm.example.com";
  try {
    assert.equal(protection.isSameOrigin(request("{}")), false);
    assert.equal(
      protection.isSameOrigin(
        request("{}", { origin: "https://evil.example" }),
      ),
      false,
    );
    assert.equal(
      protection.isSameOrigin(
        request("{}", {
          origin: "https://crm.example.com",
          "sec-fetch-site": "cross-site",
        }),
      ),
      false,
    );
    assert.equal(
      protection.isSameOrigin(
        new Request("https://evil.example", {
          headers: { origin: "https://evil.example" },
        }),
      ),
      false,
    );
    assert.equal(
      protection.isSameOrigin(
        request("{}", { origin: "https://crm.example.com" }),
      ),
      true,
    );
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});

test("body cap measures actual bytes with absent or forged content length", async () => {
  for (const headers of [
    {},
    { "content-length": "1" },
    { "content-length": "13000" },
  ]) {
    await assert.rejects(
      protection.readLimitedJson(
        request('"' + "א".repeat(7000) + '"', headers),
      ),
      /body_too_large/,
    );
  }
  assert.deepEqual(
    await protection.readLimitedJson(request('{"valid":true}')),
    { valid: true },
  );
  await assert.rejects(protection.readLimitedJson(request("{")), SyntaxError);
  await assert.rejects(
    protection.readLimitedJson(request(new Uint8Array([0xff]))),
    TypeError,
  );
});

test("per-instance throttle rejects the ninth request", () => {
  const req = request("{}", { "x-forwarded-for": "192.0.2.10" });
  for (let i = 0; i < 8; i++)
    assert.equal(protection.consumeIntakeLimit(req), true);
  assert.equal(protection.consumeIntakeLimit(req), false);
});

test("Turnstile fails closed and validates action and hostname with mocked provider", async () => {
  const oldSecret = process.env.TURNSTILE_SECRET_KEY;
  const oldPublic = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const oldFetch = globalThis.fetch;
  let calls = 0;
  let result = {
    success: true,
    action: "lead_intake",
    hostname: "crm.example.com",
  };
  globalThis.fetch = async () => {
    calls++;
    return Response.json(result);
  };
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    assert.equal(await protection.verifyTurnstile("", request("{}")), false);
    assert.equal(calls, 0);
    process.env.TURNSTILE_SECRET_KEY = "test-only";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-only";
    assert.equal(await protection.verifyTurnstile("", request("{}")), false);
    assert.equal(
      await protection.verifyTurnstile("token", request("{}")),
      true,
    );
    result = { ...result, action: "different_form" };
    assert.equal(
      await protection.verifyTurnstile("token", request("{}")),
      false,
    );
    result = { ...result, action: "lead_intake", hostname: "evil.example" };
    assert.equal(
      await protection.verifyTurnstile("token", request("{}")),
      false,
    );
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [
      ["TURNSTILE_SECRET_KEY", oldSecret],
      ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", oldPublic],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
