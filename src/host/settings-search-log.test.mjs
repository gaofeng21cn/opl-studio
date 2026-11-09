import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, writeFile, truncate } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsSearchLog } from "./settings-search-log.mjs";
import { createWebUiHost } from "./http-host.mjs";
import { CodexAppServerTransport } from "./app-server-transport.mjs";

const decoded = result => ({ status: result.status, ...JSON.parse(result.body) });
const post = (action, extra = {}) => ({ method: "POST", body: JSON.stringify({ action, ...extra }) });

test("official settings log store is bounded, isolated, and reports incomplete clear", async t => {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), "studio-search-log-"));
  t.after(() => rm(dshHome, { recursive: true, force: true }));
  const log = createSettingsSearchLog({ dshHome });
  const appended = decoded(await log(post("append", { lines: ["search fixture", "second line"] })));
  assert.equal(appended.status, 200);
  assert.equal(appended.written, 2);
  assert.equal(appended.dir, path.join(dshHome, "logs", "dsh-settings-search"));
  assert.equal(await readFile(appended.file, "utf8"), "search fixture\nsecond line\n");
  assert.equal(decoded(await log({ method: "GET", count: true })).count, 2);
  assert.match(decoded(await log({ method: "GET" })).text, /search fixture/);
  assert.equal(decoded(await log(post("open"))).status, 403);
  assert.equal(decoded(await log({ method: "PUT" })).status, 405);
  assert.equal(decoded(await log({ method: "GET", dir: "/tmp/untrusted" })).status, 400);
  assert.equal(decoded(await log(post("append", { lines: ["汉".repeat(100_000)] }))).status, 413);
  assert.equal(decoded(await log({ method: "POST", body: "invalid" })).status, 400);
  assert.equal(decoded(await log(post("clear"))).count, 0);
  assert.equal(await readFile(appended.file, "utf8"), "");
  await truncate(appended.file, 100 * 1024 * 1024);
  assert.equal(decoded(await log(post("append", { lines: ["rotated"] }))).status, 200);
  assert.equal(decoded(await log(post("clear"))).status, 200, "clear must survive the official active-file rollover");
  await mkdir(path.join(appended.dir, "settings-search-2000-01-01.log"));
  const failedClear = decoded(await log(post("clear")));
  assert.equal(failedClear.status, 500);
  assert.equal(failedClear.ok, false);
  assert.match(failedClear.detail, /incomplete/);
});

test("settings log HTTP route shares Studio authentication and CSRF without a DSH connection", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-search-log-http-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Test</title>");
  const transport = new CodexAppServerTransport({ command: process.execPath,
    args: [new URL("./fixtures/fake-app-server.mjs", import.meta.url).pathname], cwd: directory,
    env: process.env, requestTimeoutMs: 2000 });
  const host = await createWebUiHost({ dshHome: path.join(directory, "dsh"), transport, webRoot: directory,
    opl: { readState: async () => ({}), readInitialize: async () => ({}) },
    env: { ...process.env, OPL_DATA_DIR: directory, OPL_WEBUI_DEPLOYMENT_MODE: "cloud", OPL_WEBUI_AUTH_MODE: "password",
      OPL_WEBUI_USERNAME: "fixture", OPL_WEBUI_PASSWORD: "fixture-only-password", OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef" } });
  t.after(() => host.close());
  const url = `${host.url}/api/settings-search-log`;
  assert.equal((await fetch(url)).status, 401);
  const login = await fetch(`${host.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "fixture", password: "fixture-only-password" }) });
  assert.equal(login.status, 200);
  const { csrfToken } = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const request = post("append", { lines: ["authenticated log"] });
  assert.equal((await fetch(url, { ...request, headers: { cookie } })).status, 403);
  const headers = { cookie, "x-csrf-token": csrfToken, "content-type": "application/json" };
  const append = await fetch(url, { ...request, headers });
  assert.equal(append.status, 200);
  assert.equal((await append.json()).written, 1);
  const read = await fetch(url, { headers: { cookie } });
  assert.match((await read.json()).text, /authenticated log/);
  assert.equal((await fetch(url, { ...post("open"), headers })).status, 403);
  const large = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "append", lines: ["汉".repeat(100_000)] }) });
  assert.equal(large.status, 413);
  assert.equal(host.context.get("connection"), undefined);
});
