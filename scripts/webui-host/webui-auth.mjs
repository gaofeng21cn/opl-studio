import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const SESSION_COOKIE = "aionui-session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_MAX_TRACKED_SOURCES = 4_096;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function secret(env, name) {
  const file = text(env[`${name}_FILE`]);
  if (file) return text(await readFile(file, "utf8"));
  return text(env[name]);
}

function safeEqual(left, right) {
  const a = crypto.createHash("sha256").update(left).digest();
  const b = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    cookies.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
  }
  return cookies;
}

function sourceAddress(req, trustProxy) {
  const remote = req.socket.remoteAddress ?? "unknown";
  if (trustProxy) {
    const forwarded = text(Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : req.headers["x-forwarded-for"]);
    if (forwarded) return `${remote}|${forwarded.split(",")[0].trim()}`;
  }
  return remote;
}

function loginHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One Person Lab</title><style>html{color-scheme:light dark}body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.login{width:min(360px,calc(100vw - 40px));padding:28px;background:#fff;border:1px solid #d9dde5;border-radius:8px;box-shadow:0 12px 36px #16203318}.brand{font-size:22px;font-weight:700;margin:0 0 22px}.field{display:grid;gap:7px;margin:14px 0}.field input{height:42px;border:1px solid #b9c0cc;border-radius:6px;padding:0 11px;font:inherit}.submit{height:42px;width:100%;border:0;border-radius:6px;background:#1769e0;color:white;font:600 15px system-ui;cursor:pointer}.error{min-height:20px;color:#b42318;font-size:13px;margin:10px 0}@media(prefers-color-scheme:dark){body{background:#17191e;color:#f2f4f7}.login{background:#22252b;border-color:#3c414b}.field input{background:#17191e;color:#fff;border-color:#555c68}}</style></head><body><main class="login"><h1 class="brand">One Person Lab</h1><form id="login"><label class="field"><span>用户名</span><input name="username" autocomplete="username" required></label><label class="field"><span>密码</span><input name="password" type="password" autocomplete="current-password" required></label><p class="error" id="error" role="alert"></p><button class="submit" type="submit">登录</button></form></main><script>document.getElementById('login').addEventListener('submit',async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});if(response.ok){location.replace('/');return}const value=await response.json().catch(()=>({}));document.getElementById('error').textContent=value.error?.message||'登录失败';});</script></body></html>`;
}

export async function createWebUiAuth({ env = process.env, now = () => Date.now() } = {}) {
  const deploymentMode = text(env.OPL_WEBUI_DEPLOYMENT_MODE).toLowerCase() || "local";
  const authMode = text(env.OPL_WEBUI_AUTH_MODE).toLowerCase() || (deploymentMode === "cloud" ? "password" : "none");
  if (!new Set(["local", "cloud"]).has(deploymentMode)) {
    throw new Error("OPL_WEBUI_DEPLOYMENT_MODE must be local or cloud");
  }
  if (!new Set(["none", "password"]).has(authMode)) {
    throw new Error("OPL_WEBUI_AUTH_MODE must be none or password");
  }
  if (deploymentMode === "cloud" && authMode !== "password") {
    throw new Error("Cloud WebUI requires OPL_WEBUI_AUTH_MODE=password");
  }

  const enabled = authMode === "password";
  const username = text(env.OPL_WEBUI_USERNAME) || "opl";
  const password = enabled ? await secret(env, "OPL_WEBUI_PASSWORD") : "";
  const sessionSecret = enabled ? await secret(env, "OPL_WEBUI_SESSION_SECRET") : "";
  if (enabled && !password) throw new Error("Password WebUI requires OPL_WEBUI_PASSWORD or OPL_WEBUI_PASSWORD_FILE");
  if (enabled && Buffer.byteLength(sessionSecret) < 32) {
    throw new Error("Password WebUI requires a session secret of at least 32 bytes");
  }

  const failures = new Map();
  const trustProxy = deploymentMode === "cloud" || env.OPL_WEBUI_TRUST_PROXY === "1";
  const sign = (value) => crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
  const csrfFor = (sessionId) => sign(`csrf:${sessionId}`);

  function recentFailures(source, cutoff) {
    for (const [key, times] of failures) {
      const recent = times.filter((time) => time > cutoff);
      if (recent.length === 0) failures.delete(key);
      else if (recent.length !== times.length) failures.set(key, recent);
    }
    return failures.get(source) ?? [];
  }

  function recordFailure(source, recent) {
    if (!failures.has(source) && failures.size >= LOGIN_MAX_TRACKED_SOURCES) {
      failures.delete(failures.keys().next().value);
    }
    failures.set(source, recent);
  }

  function readSession(req) {
    if (!enabled) return { username, sessionId: "local", csrfToken: null };
    const raw = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
    if (!raw) return null;
    const separator = raw.lastIndexOf(".");
    if (separator < 1) return null;
    const payload = raw.slice(0, separator);
    if (!safeEqual(raw.slice(separator + 1), sign(payload))) return null;
    try {
      const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (value.username !== username || !value.sessionId || !Number.isFinite(value.expiresAt) || value.expiresAt <= now()) return null;
      return { username, sessionId: value.sessionId, csrfToken: csrfFor(value.sessionId) };
    } catch {
      return null;
    }
  }

  function requireSession(req, { csrf = false } = {}) {
    const session = readSession(req);
    if (!session) return { ok: false, status: 401, code: "authentication_required", message: "Authentication required" };
    if (csrf && enabled && !safeEqual(text(req.headers["x-csrf-token"]), session.csrfToken)) {
      return { ok: false, status: 403, code: "invalid_csrf_token", message: "A valid session CSRF token is required" };
    }
    return { ok: true, session };
  }

  function issueSession(res) {
    const sessionId = crypto.randomBytes(24).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      username,
      sessionId,
      expiresAt: now() + SESSION_MAX_AGE_SECONDS * 1_000
    })).toString("base64url");
    const secure = deploymentMode === "cloud" ? "; Secure" : "";
    res.setHeader("set-cookie", `${SESSION_COOKIE}=${payload}.${sign(payload)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
    return { username, csrfToken: csrfFor(sessionId) };
  }

  function clearSession(res) {
    const secure = deploymentMode === "cloud" ? "; Secure" : "";
    res.setHeader("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }

  function checkLogin(req, candidateUsername, candidatePassword) {
    const source = sourceAddress(req, trustProxy);
    const cutoff = now() - LOGIN_WINDOW_MS;
    const recent = recentFailures(source, cutoff);
    if (recent.length >= LOGIN_MAX_FAILURES) {
      return { ok: false, status: 429, code: "login_rate_limited", message: "Too many login attempts; try again later" };
    }
    if (!safeEqual(text(candidateUsername), username) || !safeEqual(String(candidatePassword ?? ""), password)) {
      recent.push(now());
      recordFailure(source, recent);
      return { ok: false, status: 401, code: "invalid_credentials", message: "Invalid username or password" };
    }
    failures.delete(source);
    return { ok: true };
  }

  return Object.freeze({
    enabled,
    mode: authMode,
    deploymentMode,
    cookieName: SESSION_COOKIE,
    loginHtml,
    readSession,
    requireSession,
    issueSession,
    clearSession,
    checkLogin
  });
}
