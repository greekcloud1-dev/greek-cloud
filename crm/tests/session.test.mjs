import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const original = await readFile(
  new URL("../lib/crm/session.ts", import.meta.url),
  "utf8",
);
for (const failure of ["throw", "error", "success"]) {
  test(`logout expires only this project's auth cookies when provider returns ${failure}`, async () => {
    const body = original.replace(/^import .*;\r?\n/gm, "");
    // Replace external dependencies, not the logout implementation.
    const prelude = `
      export const expired = []; export const scopes = [];
      const getSupabasePublicConfig = () => ({ projectUrl: 'https://testproject.supabase.co' });
      const cookies = async () => ({
        getAll: () => ['sb-testproject-auth-token','sb-testproject-auth-token.0',
          'sb-testproject-auth-token.1','sb-testproject-auth-token-code-verifier',
          'sb-other-auth-token','unrelated'].map(name=>({name})),
        set: (name,value,options) => expired.push({name,value,options})
      });
      const createClient = async () => ({auth:{signOut: async ({scope}) => {
        scopes.push(scope);
        ${failure === "throw" ? "throw new Error('provider unavailable');" : `return {error: ${failure === "error" ? "{message:'provider unavailable'}" : "null"}};`}
      }}});
    `;
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(prelude + body)).toString("base64")}`
    );
    await module.endLocalSession("global");
    assert.equal(module.expired.length, 4);
    assert.deepEqual(module.scopes, ["global"]);
    for (const cookie of module.expired) {
      assert.ok(cookie.name.startsWith("sb-testproject-auth-token"));
      assert.equal(cookie.value, "");
      assert.equal(cookie.options.maxAge, 0);
      assert.equal(cookie.options.path, "/");
    }
  });
}
