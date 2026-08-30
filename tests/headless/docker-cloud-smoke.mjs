import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const image = process.env.OPL_CLOUD_SMOKE_IMAGE;
if (!image) throw new Error("OPL_CLOUD_SMOKE_IMAGE is required");

const suffix = `${process.pid}-${Date.now()}`;
const container = `opl-studio-cloud-smoke-${suffix}`;
const dataVolume = `${container}-data`;
const projectsVolume = `${container}-projects`;
const secretRoot = await mkdtemp(path.join(os.tmpdir(), "opl-studio-cloud-secrets-"));
const password = "preview-test-password";
const passwordFile = path.join(secretRoot, "password");
const sessionFile = path.join(secretRoot, "session-secret");
await writeFile(passwordFile, password, { mode: 0o600 });
await writeFile(sessionFile, "preview-session-secret-0123456789abcdef0123456789", { mode: 0o600 });

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`${url} did not become available`);
}

function authenticatedHeaders(cookie, csrfToken, extra = {}) {
  return { cookie, "x-csrf-token": csrfToken, ...extra };
}

const port = await freePort();
try {
  docker("volume", "create", dataVolume);
  docker("volume", "create", projectsVolume);
  docker(
    "run", "--detach", "--name", container,
    "--publish", `127.0.0.1:${port}:3000`,
    "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=256m",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "512",
    "--user", "1000:1000",
    "--mount", `type=volume,src=${dataVolume},dst=/data`,
    "--mount", `type=volume,src=${projectsVolume},dst=/projects`,
    "--mount", `type=bind,src=${passwordFile},dst=/run/secrets/opl-password,readonly`,
    "--mount", `type=bind,src=${sessionFile},dst=/run/secrets/opl-session,readonly`,
    "--env", "OPL_WEBUI_DEPLOYMENT_MODE=cloud",
    "--env", "OPL_WEBUI_AUTH_MODE=password",
    "--env", "OPL_WEBUI_USERNAME=opl",
    "--env", "OPL_WEBUI_PASSWORD_FILE=/run/secrets/opl-password",
    "--env", "OPL_WEBUI_SESSION_SECRET_FILE=/run/secrets/opl-session",
    image
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor(`${baseUrl}/healthz`);
  await waitFor(`${baseUrl}/readyz`);
  assert.equal((await fetch(`${baseUrl}/`, { redirect: "manual" })).status, 302);
  assert.equal((await fetch(`${baseUrl}/api/auth/user`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/opl/state?profile=fast`)).status, 401);

  const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "opl", password: "wrong" })
  });
  assert.equal(badLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "opl", password })
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("aionui-session="));
  assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Lax; Secure/);
  assert.ok(session.csrfToken);

  const user = await fetch(`${baseUrl}/api/auth/user`, { headers: { cookie } });
  assert.equal(user.status, 200);
  assert.equal((await user.json()).username, "opl");
  assert.equal((await fetch(`${baseUrl}/api/inputs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "directory" })
  })).status, 403);

  const create = await fetch(`${baseUrl}/api/inputs`, {
    method: "POST",
    headers: authenticatedHeaders(cookie, session.csrfToken, { "content-type": "application/json" }),
    body: JSON.stringify({ kind: "directory" })
  });
  assert.equal(create.status, 201);
  const group = await create.json();
  const traversal = await fetch(`${baseUrl}/api/inputs/${group.id}/files?path=${encodeURIComponent("../escape.txt")}`, {
    method: "PUT",
    headers: authenticatedHeaders(cookie, session.csrfToken),
    body: "no"
  });
  assert.equal(traversal.status, 400);

  const readyCreate = await fetch(`${baseUrl}/api/inputs`, {
    method: "POST",
    headers: authenticatedHeaders(cookie, session.csrfToken, { "content-type": "application/json" }),
    body: JSON.stringify({ kind: "directory" })
  }).then((response) => response.json());
  const upload = await fetch(`${baseUrl}/api/inputs/${readyCreate.id}/files?path=${encodeURIComponent("sample/note.txt")}`, {
    method: "PUT",
    headers: authenticatedHeaders(cookie, session.csrfToken),
    body: "persistent cloud upload"
  });
  assert.equal(upload.status, 201);
  const complete = await fetch(`${baseUrl}/api/inputs/${readyCreate.id}/complete`, {
    method: "POST",
    headers: authenticatedHeaders(cookie, session.csrfToken, { "content-type": "application/json" }),
    body: "{}"
  });
  assert.equal(complete.status, 200);
  const completed = await complete.json();
  assert.equal(completed.inputs[0].kind, "folder");
  assert.match(completed.inputs[0].path, /^\/data\/inputs\//);
  docker("exec", container, "cat", `${completed.inputs[0].path}/note.txt`);

  const eventAbort = new AbortController();
  const events = await fetch(`${baseUrl}/api/opl-events`, { headers: { cookie }, signal: eventAbort.signal });
  assert.equal(events.status, 200);
  const event = await events.body.getReader().read();
  assert.match(new TextDecoder().decode(event.value), /host\/ready/);
  eventAbort.abort();

  docker("restart", container);
  await waitFor(`${baseUrl}/readyz`);
  assert.equal(docker("exec", container, "cat", `${completed.inputs[0].path}/note.txt`), "persistent cloud upload");
  assert.equal(docker("inspect", container, "--format", "{{.Config.User}}"), "1000:1000");
  assert.equal(docker("inspect", container, "--format", "{{.HostConfig.ReadonlyRootfs}}"), "true");
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.CapDrop}}"), /ALL/);
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.SecurityOpt}}"), /no-new-privileges/);

  console.log(JSON.stringify({
    status: "cloud_webui_container_smoke_passed",
    image,
    endpoint: "http:3000",
    auth: "password_session_csrf",
    upload: "directory_persisted_across_restart",
    runtimeUser: "1000:1000"
  }, null, 2));
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  spawnSync("docker", ["volume", "rm", "--force", dataVolume, projectsVolume], { stdio: "ignore" });
}
