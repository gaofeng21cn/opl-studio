import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, symlink, readlink, unlink } from "node:fs/promises";
import path from "node:path";

export const name = "opl-superagent";
export const inject = ["oplStudioHostOptions"];

/** Independent official profile: its own accounts, policy, tickets, sessions and lifecycle. */
export class SuperagentProfile {
  constructor({ home, env = process.env, spawnProcess = spawn, cli }) {
    this.home = home;
    this.env = env;
    this.spawnProcess = spawnProcess;
    const require = createRequire(import.meta.url);
    this.cli = cli ?? path.join(path.dirname(require.resolve("@deepseek-ai/dsh/package.json")), "lib/bin.js");
    this.engine = path.dirname(require.resolve("dsh-superagent/package.json"));
    this.state = "stopped";
    this.child = null;
    this.url = null;
    this.error = null;
    this.starting = null;
    this.generation = 0;
  }
  read() { return { state: this.state, url: this.url, error: this.error, dataDirectory: this.home, teamDependency: false }; }
  async prepare() {
    const profile = path.join(this.home, "profiles/web");
    await mkdir(profile, { recursive: true });
    for (const [name, contents] of [
      ["package.json", JSON.stringify({ name: "opl-superagent-profile", private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-superagent"] } } }, null, 2)],
      ["cordis.patch.yml", JSON.stringify([{ id: "dsh-superagent", config: { stateDir: path.join(this.home, "state") } }], null, 2)],
      ["pnpm-workspace.yaml", "packages: []\n"]
    ]) {
      try { await readFile(path.join(profile, name)); }
      catch (error) { if (error.code !== "ENOENT") throw error; await writeFile(path.join(profile, name), `${contents}\n`, { mode: 0o600, flag: "wx" }); }
    }
    // Profile-installed plugins use the official Node package resolution boundary.
    // Only this private delivery package is linked; no user dependency is replaced.
    const modules = path.join(profile, "node_modules");
    const engineLink = path.join(modules, "dsh-superagent");
    await mkdir(modules, { recursive: true });
    try {
      const existing = await readlink(engineLink);
      if (existing !== this.engine) { await unlink(engineLink); await symlink(this.engine, engineLink, "dir"); }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await symlink(this.engine, engineLink, "dir");
    }
  }
  start() {
    if (this.state === "running") return Promise.resolve(this.read());
    this.starting ??= this.launch().finally(() => { this.starting = null; });
    return this.starting;
  }
  async launch() {
    const generation = this.generation;
    await this.prepare();
    if (generation !== this.generation) return this.read();
    this.state = "starting"; this.error = null;
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(process.execPath, [this.cli, "--profile", "web", "--host", "127.0.0.1", "--port", "0", "--no-open"], {
        cwd: this.home,
        env: { ...this.env, DSH_HOME: this.home, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.child = child;
      let settled = false;
      let output = "";
      let stderr = "";
      const fail = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (generation === this.generation) { this.state = "error"; this.error = error.message; }
        reject(error);
      };
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        fail(Object.assign(Error("Official Superagent profile did not report readiness within 60 seconds."), { code: "superagent_start_timeout", diagnostic: stderr }));
      }, 60_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        output = `${output}${chunk}`.slice(-16384);
        const match = output.replace(/\u001b\[[0-9;]*m/g, "").match(/https?:\/\/127\.0\.0\.1:\d+[^\s]*/);
        if (match && !settled) {
          const url = new URL(match[0]);
          if (url.hostname !== "127.0.0.1" || !url.port) return;
          settled = true; clearTimeout(timer); this.url = url.href; this.state = "running";
          resolve(this.read());
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-12000); });
      child.once("error", error => fail(Object.assign(Error("Official Superagent process could not start."), { cause: error, diagnostic: stderr })));
      child.once("exit", (code, signal) => {
        if (this.child === child) { this.child = null; this.url = null; }
        if (!settled) fail(Object.assign(Error(`Official Superagent profile exited before readiness (${signal ?? code}).`), { diagnostic: stderr }));
        else if (generation === this.generation && this.state !== "stopped") { this.state = "error"; this.error = `Superagent stopped (${signal ?? code}).`; }
      });
    });
  }
  async stop() {
    this.generation++;
    const child = this.child;
    this.state = "stopped"; this.url = null; this.error = null;
    if (!child || child.exitCode !== null) return this.read();
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); }, 5000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill("SIGTERM");
    });
    return this.read();
  }
}

export function apply(ctx) {
  const options = ctx.oplStudioHostOptions;
  const service = new SuperagentProfile({ home: path.join(options.dshHome, "opl-superagent"), env: options.env });
  ctx.provide("oplSuperagent", service);
  ctx.effect(() => () => service.stop(), "independent official Superagent profile");
}
