import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readStudioSettingsSearchClient } from "../../scripts/settings-search-client.mjs";

function clientFixture() {
  const bridgeCalls = [];
  const networkCalls = [];
  const storageCalls = [];
  const timers = [];
  let plugin;
  const storage = {
    getItem(key) { storageCalls.push(["read", key]); return key.endsWith("ai-enabled") ? "1" : key.includes("ai-") ? "old-secret-fixture" : null; },
    setItem(key) { storageCalls.push(["write", key]); }, removeItem(key) { storageCalls.push(["remove", key]); },
  };
  const sandbox = { Response, TextEncoder, URL, AbortController,
    setTimeout(callback) { timers.push(callback); return 1; }, clearTimeout() {},
    localStorage: storage, sessionStorage: storage,
    fetch: async (...args) => { networkCalls.push(args); throw new Error("Unexpected direct network request"); },
    window: { oplStudio: { async requestSettingsSearchLog(request) {
      bridgeCalls.push(request); return { status: 200, body: JSON.stringify({ ok: true, written: 1, count: 1 }) };
    } }, __ModuleLoader__: { load(registration) { plugin = registration.factory(() => React); } } },
  };
  runInNewContext(readStudioSettingsSearchClient(), sandbox);
  return { plugin, bridgeCalls, networkCalls, storageCalls, timers, sandbox };
}

test("actual upstream components retain local settings and never read legacy model credentials", async () => {
  const fixture = clientFixture();
  const components = new Map();
  let dictionary;
  fixture.plugin.apply({
    get: () => undefined, inject() {}, effect: callback => callback(),
    slots: { entries: () => [], inject: (_name, callback) => callback(), register(options, Component) {
      components.set(options.name, Component); return () => {};
    } },
    locale: { register: (_namespace, dict) => { dictionary = dict.en; return () => {}; }, bind: () => key => dictionary[key] ?? key },
  });
  assert.deepEqual(Array.from(fixture.plugin.inject), ["slots", "locale"]);
  const settings = renderToStaticMarkup(React.createElement(components.get("settings.section")));
  assert.match(settings, /Logs/);
  assert.match(settings, /Ctrl\+F/);
  assert.doesNotMatch(settings, /dsh-settings-search-(?:api-key|provider|model|base-url)/);
  const header = renderToStaticMarkup(React.createElement(components.get("settings.header")));
  assert.doesNotMatch(header, /AI hints/);
  assert.deepEqual(fixture.storageCalls.filter(([, key]) => key.includes(":ai-")), []);
  for (const callback of fixture.timers.splice(0)) await callback();
  assert.ok(fixture.bridgeCalls.some(call => call.method === "POST" && JSON.parse(call.body).action === "append"));
  assert.deepEqual(fixture.networkCalls, []);
});

test("desktop preload sends only the existing trusted invoke envelope for settings logs", async () => {
  let surface;
  const calls = [];
  runInNewContext(readFileSync(new URL("../../desktop/preload.cjs", import.meta.url), "utf8"), {
    require: name => { assert.equal(name, "electron"); return {
      contextBridge: { exposeInMainWorld(_name, value) { surface = value; } }, webUtils: {},
      ipcRenderer: { invoke: async (channel, envelope) => { calls.push({ channel, ...envelope }); return { status: 403, body: '{"ok":false}' }; } },
    }; },
  });
  const request = { method: "POST", body: '{"action":"clear"}' };
  const response = await surface.requestSettingsSearchLog(request);
  assert.equal(response.status, 403);
  assert.equal(calls[0].channel, "opl:invoke");
  assert.equal(calls[0].method, "requestSettingsSearchLog");
  assert.equal(calls[0].payload, request);
});


test("fixed log transport orders delayed append before clear and preserves failure status", async () => {
  let scopedFetch;
  let releaseAppend;
  let clearCalls = 0;
  let records = [];
  const externalFetch = async () => new Response("external");
  const source = readStudioSettingsSearchClient().replace(
    "const STUDIO_LOCAL_SEARCH_ONLY = true;",
    "globalThis.captureScopedFetch(fetch);\nconst STUDIO_LOCAL_SEARCH_ONLY = true;",
  );
  const sandbox = { Response, TextEncoder, fetch: externalFetch,
    captureScopedFetch: value => { scopedFetch = value; },
    window: { __ModuleLoader__: { load() {} }, oplStudio: { async requestSettingsSearchLog(request) {
      const body = JSON.parse(request.body);
      if (body.action === "append") {
        await new Promise(resolve => { releaseAppend = resolve; });
        records.push(...body.lines);
      } else if (body.action === "clear") {
        clearCalls += 1;
        records = [];
      } else return { status: 500, body: '{"ok":false,"detail":"fixture failure"}' };
      return { status: 200, body: JSON.stringify({ ok: true, count: records.length }) };
    } } },
  };
  runInNewContext(source, sandbox);
  const append = scopedFetch("api/settings-search-log", { method: "POST", body: JSON.stringify({ action: "append", lines: ["earlier"] }) });
  const clear = scopedFetch("api/settings-search-log", { method: "POST", body: JSON.stringify({ action: "clear" }) });
  await Promise.resolve();
  assert.equal(clearCalls, 0);
  releaseAppend();
  await Promise.all([append, clear]);
  assert.equal(clearCalls, 1);
  assert.deepEqual(records, []);
  const failed = await scopedFetch("api/settings-search-log", { method: "POST", body: '{"action":"fail"}' });
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).detail, "fixture failure");
  const large = await scopedFetch("api/settings-search-log", { method: "POST", body: "汉".repeat(100_000) });
  assert.equal(large.status, 413);
  assert.equal(await (await scopedFetch("https://example.test/info")).text(), "external");
  assert.equal(sandbox.fetch, externalFetch, "the global fetch owner is unchanged");
});
