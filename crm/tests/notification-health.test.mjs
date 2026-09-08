import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const original = await readFile(
  new URL("../lib/notifications/dispatch.ts", import.meta.url),
  "utf8",
);
for (const scenario of [
  { name: "empty healthy queue", review: 0, error: null, ok: true },
  { name: "old unresolved delivery", review: 1, error: null, ok: false },
  {
    name: "failed queue query",
    review: null,
    error: { code: "test_error" },
    ok: false,
  },
]) {
  test(`worker reports ${scenario.name} correctly without sending`, async () => {
    const body = original.replace(/^import .*;\r?\n/gm, "");
    const prelude = `
      const getEmailReadiness = () => ({configured:true,missing:[]});
      const getTelegramReadiness = getEmailReadiness;
      const sendEmailNotification = () => {throw new Error('unexpected real delivery');};
      const sendTelegramNotification = sendEmailNotification;
      const createAdminClient = () => ({
        rpc: async (name) => ({data:name==='crm_claim_notification_deliveries'?[]:{},error:null}),
        from: () => {
          const chain = {select:()=>chain,in:()=>chain,or:()=>chain,eq:()=>chain,is:()=>chain,
            then:(resolve,reject)=>Promise.resolve(${JSON.stringify({ count: scenario.review, error: scenario.error })}).then(resolve,reject)};
          return chain;
        }
      });
    `;
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(prelude + body)).toString("base64")}`
    );
    const result = await module.dispatchCrmNotifications();
    assert.equal(result.ok, scenario.ok);
    assert.equal(result.run.sent, 0);
    assert.equal(result.run.claimed, 0);
  });
}
