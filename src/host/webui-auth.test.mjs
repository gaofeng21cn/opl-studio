import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import test from "node:test";
import { createWebUiAuth } from "./webui-auth.mjs";

function request({ cookie = "", csrf = "", address = "127.0.0.1", forwardedFor = "" } = {}) {
  return {
    headers: { cookie, "x-csrf-token": csrf, "x-forwarded-for": forwardedFor },
    socket: { remoteAddress: address }
  };
}

function response() {
  const headers = new Map();
  return { headers, setHeader: (name, value) => headers.set(name.toLowerCase(), value) };
}

test("cloud password auth uses file secrets, signs a 30-day cookie, and binds CSRF to the session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-web-auth-"));
  const passwordFile = path.join(directory, "password");
  const secretFile = path.join(directory, "session");
  await writeFile(passwordFile, "file-password\n");
  await writeFile(secretFile, "0123456789abcdef0123456789abcdef\n");
  const auth = await createWebUiAuth({ env: {
    OPL_WEBUI_DEPLOYMENT_MODE: "cloud",
    OPL_WEBUI_AUTH_MODE: "password",
    OPL_WEBUI_USERNAME: "opl",
    OPL_WEBUI_PASSWORD: "ignored-password",
    OPL_WEBUI_PASSWORD_FILE: passwordFile,
    OPL_WEBUI_SESSION_SECRET: "ignored-secret-which-is-also-long-enough",
    OPL_WEBUI_SESSION_SECRET_FILE: secretFile
  } });
  assert.equal(auth.checkLogin(request(), "opl", "file-password").ok, true);
  assert.equal(auth.checkLogin(request(), "opl", "ignored-password").ok, false);

  const res = response();
  const issued = auth.issueSession(res);
  const setCookie = res.headers.get("set-cookie");
  assert.match(setCookie, /^opl-studio-session=/);
  assert.match(setCookie, /Max-Age=2592000/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0];
  assert.equal(auth.requireSession(request({ cookie })).ok, true);
  assert.equal(auth.requireSession(request({ cookie }), { csrf: true }).code, "invalid_csrf_token");
  assert.equal(auth.requireSession(request({ cookie, csrf: issued.csrfToken }), { csrf: true }).ok, true);
});

test("cloud auth fails before listen when credentials are incomplete", async () => {
  await assert.rejects(
    createWebUiAuth({ env: { OPL_WEBUI_DEPLOYMENT_MODE: "cloud", OPL_WEBUI_AUTH_MODE: "password" } }),
    /requires OPL_WEBUI_PASSWORD/
  );
  await assert.rejects(
    createWebUiAuth({ env: { OPL_WEBUI_DEPLOYMENT_MODE: "cloud", OPL_WEBUI_AUTH_MODE: "none" } }),
    /requires OPL_WEBUI_AUTH_MODE=password/
  );
});

test("password login is limited to five failures per source in fifteen minutes", async () => {
  const auth = await createWebUiAuth({ env: {
    OPL_WEBUI_AUTH_MODE: "password",
    OPL_WEBUI_PASSWORD: "correct",
    OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
  } });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(auth.checkLogin(request(), "opl", "wrong").status, 401);
  }
  assert.equal(auth.checkLogin(request(), "opl", "correct").status, 429);
});

test("cloud login limits are bound to both the proxy peer and first forwarded address", async () => {
  const auth = await createWebUiAuth({ env: {
    OPL_WEBUI_DEPLOYMENT_MODE: "cloud",
    OPL_WEBUI_AUTH_MODE: "password",
    OPL_WEBUI_PASSWORD: "correct",
    OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
  } });
  const firstSource = request({ address: "10.0.0.2", forwardedFor: "203.0.113.4, 10.0.0.1" });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(auth.checkLogin(firstSource, "opl", "wrong").status, 401);
  }
  assert.equal(auth.checkLogin(firstSource, "opl", "correct").status, 429);
  assert.equal(auth.checkLogin(
    request({ address: "10.0.0.3", forwardedFor: "203.0.113.4, 10.0.0.1" }),
    "opl",
    "correct"
  ).ok, true);
  assert.equal(auth.checkLogin(
    request({ address: "10.0.0.2", forwardedFor: "203.0.113.5, 10.0.0.1" }),
    "opl",
    "correct"
  ).ok, true);
});

test("expired login failures are pruned and tracked sources stay bounded", async () => {
  let clock = 1_000_000;
  const auth = await createWebUiAuth({
    env: {
      OPL_WEBUI_AUTH_MODE: "password",
      OPL_WEBUI_PASSWORD: "correct",
      OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
    },
    now: () => clock
  });
  const oldest = request({ address: "192.0.2.1" });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(auth.checkLogin(oldest, "opl", "wrong").status, 401);
  }
  for (let index = 2; index <= 4_097; index += 1) {
    assert.equal(auth.checkLogin(request({ address: `192.0.2.${index}` }), "opl", "wrong").status, 401);
  }
  assert.equal(auth.checkLogin(oldest, "opl", "correct").ok, true);

  const expiring = request({ address: "198.51.100.10" });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(auth.checkLogin(expiring, "opl", "wrong").status, 401);
  }
  assert.equal(auth.checkLogin(expiring, "opl", "correct").status, 429);
  clock += 15 * 60 * 1_000 + 1;
  assert.equal(auth.checkLogin(expiring, "opl", "correct").ok, true);
});


test("trusted deployment prefix scopes session cookies and rejects ambiguous paths", async () => {
  const env = {
    OPL_WEBUI_DEPLOYMENT_MODE: "cloud",
    OPL_WEBUI_PASSWORD: "correct",
    OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
  };
  const auth = await createWebUiAuth({ env });
  const req = request();
  req.headers["x-forwarded-prefix"] = "/w/workspace_0123456789abcdef0123456789abcdef";
  const base = "/w/workspace_0123456789abcdef0123456789abcdef/";
  assert.equal(auth.basePath(req), base);
  const res = response();
  auth.issueSession(res, req);
  assert.ok(res.headers.get("set-cookie").includes(`; Path=${base};`));
  auth.clearSession(res, req);
  assert.ok(res.headers.get("set-cookie").includes(`; Path=${base};`));
  for (const prefix of ["//evil.example", "/w/../other", "/w/%2e%2e/", "/w/x?next=1", "/w/x#hash", "/w/x;Path=/", "/w/x, /w/y", "/w/x\n", ["/w/x", "/w/y"]]) {
    req.headers["x-forwarded-prefix"] = prefix;
    assert.throws(() => auth.basePath(req), /Invalid trusted WebUI prefix/);
  }
  const local = await createWebUiAuth({ env: {} });
  req.headers["x-forwarded-prefix"] = "/w/ignored";
  assert.equal(local.basePath(req), "/");
  assert.equal(auth.basePath(request()), "/");
});

test("Workspace sessions take precedence over a retained root cookie without authentication fallback", async () => {
  const auth = await createWebUiAuth({ env: {
    OPL_WEBUI_DEPLOYMENT_MODE: "cloud",
    OPL_WEBUI_PASSWORD: "correct",
    OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
  } });
  const req = request();
  req.headers["x-forwarded-prefix"] = "/w/workspace_0123456789abcdef0123456789abcdef";
  const res = response();
  const session = auth.issueSession(res, req);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  // Cookie ordering matches the browser's longest-path-first ordering.
  const migrated = request({ cookie: `${cookie}; ${auth.cookieName}=stale-root-session`, csrf: session.csrfToken });
  assert.equal(auth.requireSession(migrated, { csrf: true }).ok, true);
  const invalidSpecific = request({ cookie: `${auth.cookieName}=invalid-specific-session; ${cookie}` });
  assert.equal(auth.requireSession(invalidSpecific).status, 401);
});
