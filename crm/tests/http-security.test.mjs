import assert from "node:assert/strict";
import { test } from "node:test";

const origin = process.env.CRM_TEST_ORIGIN;
if (origin && !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error(
    "HTTP security checks are restricted to a local isolated server",
  );
}
test(
  "production HTTP boundaries fail closed without configuration",
  { skip: !origin },
  async () => {
    for (const route of ["/api/crm/data", "/api/cron/crm-notifications"]) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 503, route);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    const post = (route, body, extra = {}) =>
      fetch(`${origin}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, ...extra },
        body,
      });
    assert.equal(
      (await post("/api/crm/mutate", "{}", { origin: "https://evil.example" }))
        .status,
      403,
    );
    assert.equal((await post("/api/crm/mutate", "{")).status, 400);
    assert.equal(
      (await post("/api/crm/mutate", '"' + "x".repeat(17000) + '"')).status,
      413,
    );
    assert.equal(
      (
        await post(
          "/api/crm/mutate",
          '{"type":"create_case","fullName":"Test","phone":"+12025550143","service":"other"}',
        )
      ).status,
      503,
    );
    assert.equal(
      (await post("/api/leads", "{}", { origin: "https://evil.example" }))
        .status,
      403,
    );
    assert.equal(
      (await post("/api/leads", '"' + "x".repeat(13000) + '"')).status,
      413,
    );
    assert.equal((await post("/api/integrations/website", "{}")).status, 503);
    const lead = await post("/api/leads", JSON.stringify({
      fullName: "Synthetic Security Test", phone: "+12025550143", service: "other",
      preferredChannel: "phone", contactConsent: true,
    }));
    assert.equal(lead.status, 503);
    assert.equal((await lead.json()).reference, undefined);
  },
);

test(
  "HTML uses fresh matching script nonces and private security headers",
  { skip: !origin },
  async () => {
    let previous;
    for (const route of [
      "/crm",
      "/crm",
      "/crm/login",
      "/request",
      "/crm/auth/confirm",
    ]) {
      const response = await fetch(`${origin}${route}`, {
        headers: { "x-nonce": "attacker-chosen" },
      });
      const html = await response.text();
      const csp = response.headers.get("content-security-policy");
      const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];
      assert.ok(nonce, route);
      assert.notEqual(nonce, previous);
      assert.notEqual(nonce, "attacker-chosen");
      previous = nonce;
      assert.ok(html.includes(`nonce="${nonce}"`), route);
      assert.ok(!csp.includes("'unsafe-eval'"));
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
    }
  },
);
