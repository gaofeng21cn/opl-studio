import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-plugin-publication.mjs", import.meta.url));

function run(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, options);
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", status => resolve({ status, stdout, stderr }));
  });
}

test("publication check permits only identical already-published package bytes", async context => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "opl-publication-check-"));
  context.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const directory = path.join(temp, "plugin");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "@fixture/plugin", version: "1.0.0", files: ["index.mjs"] }));
  fs.writeFileSync(path.join(directory, "index.mjs"), "export const value = 1;\n");
  const packedResult = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temp], { cwd: directory, encoding: "utf8" }));
  const packed = Array.isArray(packedResult) ? packedResult[0] : Object.values(packedResult)[0];
  let mode = "published";
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (mode === "missing") {
      response.writeHead(404); response.end(JSON.stringify({ error: "not found" })); return;
    }
    if (mode === "unauthorized") {
      response.writeHead(401); response.end(JSON.stringify({ error: "token not found" })); return;
    }
    response.end(JSON.stringify({ name: "@fixture/plugin", "dist-tags": { latest: "1.0.0" }, versions: {
      "1.0.0": { name: "@fixture/plugin", version: "1.0.0", dist: { shasum: packed.shasum } }
    } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const registry = `http://127.0.0.1:${server.address().port}`;
  const runCheck = () => run([script, directory], { env: {
    ...process.env, NPM_REGISTRY: registry, NPM_CONFIG_CACHE: path.join(temp, "npm-cache"), NPM_CONFIG_FETCH_RETRIES: "0"
  } });

  const identical = await runCheck();
  assert.equal(identical.status, 0, identical.stderr);
  assert.equal(JSON.parse(identical.stdout).status, "published");

  fs.writeFileSync(path.join(directory, "index.mjs"), "export const value = 2;\n");
  const changed = await runCheck();
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /already published with different bytes/);

  mode = "missing";
  const missing = await runCheck();
  assert.equal(missing.status, 0, missing.stderr);
  assert.equal(JSON.parse(missing.stdout).status, "unpublished");

  mode = "unauthorized";
  const unavailable = await runCheck();
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /Cannot inspect/);
  assert.doesNotMatch(unavailable.stdout, /unpublished/);
});
