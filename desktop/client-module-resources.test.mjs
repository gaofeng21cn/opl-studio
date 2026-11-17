import assert from "node:assert/strict";
import test from "node:test";
import { createClientModuleResourceHandler } from "./client-module-resources.mjs";

test("desktop client resource handler forwards only official DSH plugin routes", async () => {
  const calls = [];
  const handler = createClientModuleResourceHandler(async (method, payload) => {
    calls.push([method, payload]);
    return {
      status: 200,
      headers: { "content-type": "text/javascript; charset=utf-8" },
      body: Buffer.from("window.__ModuleLoader__.load({id:'x'});", "utf8").toString("base64")
    };
  });

  const response = await handler(new Request("opl-client://modules/plugins/x.js?rev=1"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "window.__ModuleLoader__.load({id:'x'});");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "readClientModuleBundle");
  assert.deepEqual(calls[0][1], { url: "/plugins/x.js?rev=1", method: "GET", ifNoneMatch: undefined });

  assert.equal((await handler(new Request("opl-client://modules/secret.js"))).status, 404);
  assert.equal((await handler(new Request("http://modules/plugins/x.js"))).status, 404);
  assert.equal((await handler(new Request("opl-client://modules/plugins/x.js", { method: "POST" }))).status, 405);
});
