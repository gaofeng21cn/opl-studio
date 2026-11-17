import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile, symlink, readlink, unlink } from "node:fs/promises";
import path from "node:path";
import { initProfile, readProfileManifest, writeProfileBundles } from "@deepseek-ai/dsh-app-boot";

const CHANNEL = "opl-codex-parent.v1";
const BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@gaofeng21cn/opl-codex-agents"];
const METHODS = new Set(["listModels", "startThread", "resumeThread", "readThread", "startTurn", "waitForTurn", "request"]);

/** Complete official application; OPL owns only launch and the executor reference. */
export class CodexWorkbenchProfile {
  constructor(options, codex, kind = "collaboration") {
    this.kind = kind;
    this.bundles = kind === "superagent" ? [...BUNDLES, "dsh-superagent"] : BUNDLES;
    this.options = options;
    this.transport = codex.transport;
    this.home = path.join(options.dshHome, `opl-${kind}`);
    this.state = "stopped"; this.url = null; this.error = null;
    this.child = null; this.starting = null; this.generation = 0;
    this.diagnostic = "";
    this.turns = new Map(); this.threads = new Set(); this.toolRequests = new Set();
    const require = createRequire(import.meta.url);
    this.cli = path.join(path.dirname(require.resolve("@deepseek-ai/dsh/package.json")), "lib/bin.js");
    this.engine = path.dirname(require.resolve("@gaofeng21cn/opl-codex-agents/package.json"));
  }
  read() { return { state: this.state, url: this.url, error: this.error, dataDirectory: this.home }; }
  async prepare(defaultModel) {
    const dir = path.join(this.home, "profiles/web");
    initProfile(dir, this.bundles);
    const manifest = readProfileManifest("OPL collaboration", dir);
    const bundles = [...new Set([...(manifest.dsh?.profile?.bundles ?? []).map(name =>
      name === "@one-person-lab/opl-codex-agents" ? "@gaofeng21cn/opl-codex-agents" : name), ...this.bundles])];
    if (JSON.stringify(manifest.dsh?.profile?.bundles) !== JSON.stringify(bundles)) writeProfileBundles(dir, manifest, bundles);
    const link = path.join(dir, "node_modules/@gaofeng21cn/opl-codex-agents");
    await mkdir(path.dirname(link), { recursive: true });
    try { if (await readlink(link) !== this.engine) { await unlink(link); await symlink(this.engine, link, "dir"); } }
    catch (error) { if (error.code !== "ENOENT") throw error; await symlink(this.engine, link, "dir"); }
    // Deployment facts stay outside the user's native Settings/profile patch.
    const patch = path.join(this.home, "opl-runtime.patch.yml");
    await writeFile(patch, JSON.stringify([
      { insert: [{ id: "opl-parent-transport", name: "@gaofeng21cn/opl-codex-agents/parent-transport", config: {
        codexEnvironmentStateDir: this.kind === "superagent" ? path.join(this.home, "state") : undefined,
        parentHome: this.options.dshHome, bindingHome: this.kind === "superagent" ? this.home : this.options.dshHome, workspaceRoot: this.options.workspaceRoot, defaultModel } }] },
      { id: "session-persistence-jsonl", config: { root: this.kind === "superagent" ? path.join(this.home, "sessions") : path.join(this.options.dshHome, "opl/sessions") } },
      { id: "fs-sandbox", config: { cwd: this.options.workspaceRoot } },
      { id: "session-telemetry-otel", disabled: true },
      ...(this.kind === "superagent" ? [{ id: "dsh-superagent", config: { stateDir: path.join(this.home, "state") } }] : []),
    ], null, 2), { mode: 0o600 });
    return patch;
  }
  async handle(child, message) {
    if (message?.channel !== CHANNEL || child !== this.child) return;
    if (message.event === "toolResponse") {
      if (this.toolRequests.delete(message.id)) this.transport.respondToServerRequest(message.id, message.response);
      return;
    }
    try {
      if (!METHODS.has(message.method) || !Array.isArray(message.args)) throw Error("Unsupported Codex transport operation.");
      if (message.method === "request" && message.args[0] !== "turn/interrupt") throw Error("Only exact-turn cancellation is available.");
      if (["startThread", "startTurn"].includes(message.method) && this.state === "stopped") throw Error("Collaboration is stopping.");
      const result = await this.transport[message.method](...message.args);
      if (message.method === "startThread" && child === this.child) this.threads.add(result.thread.id);
      if (message.method === "resumeThread" && child === this.child) this.threads.add(message.args[0]);
      if (message.method === "startTurn" && result.turn?.id) {
        this.turns.set(result.turn.id, message.args[0]);
        if (!child.connected || child !== this.child) {
          await this.transport.request("turn/interrupt", { threadId: message.args[0], turnId: result.turn.id });
          this.turns.delete(result.turn.id);
        }
      }
      if (message.method === "waitForTurn") this.turns.delete(message.args[0]);
      if (child.connected) child.send({ channel: CHANNEL, id: message.id, result }, () => {});
    } catch (error) {
      if (child.connected) child.send({ channel: CHANNEL, id: message.id, error: { message: error.message, code: error.code } }, () => {});
    }
  }
  start() {
    if (this.state === "running") return Promise.resolve(this.read());
    this.starting ??= this.launch().finally(() => { this.starting = null; });
    return this.starting;
  }
  async launch() {
    const generation = this.generation;
    this.state = "starting"; this.error = null; this.diagnostic = "";
    try {
      const models = (await this.transport.listModels()).data ?? [];
      const model = models.find(item => item.isDefault) ?? models[0];
      if (!model) throw Error("Codex has no available models. Sign in or configure Codex in App settings.");
      const patch = await this.prepare(model.id ?? model.model);
      if (generation !== this.generation) return this.read();
      const child = spawn(process.execPath, [this.cli, "--profile", "web", "--patch", patch, "--host", "127.0.0.1", "--port", "0", "--no-open"], {
        cwd: this.home, env: { ...(this.options.env ?? process.env), DSH_HOME: this.home, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"]
      });
      this.child = child;
      const onRequest = request => {
        if (request.method !== "item/tool/call" || !this.threads.has(request.params?.threadId) || !child.connected) return;
        this.toolRequests.add(request.id);
        child.send({ channel: CHANNEL, event: "serverRequest", value: request }, () => {});
      };
      this.transport.on("serverRequest", onRequest);
      child.on("message", message => { void this.handle(child, message); });
      child.once("exit", () => {
        this.transport.off("serverRequest", onRequest);
        if (this.child === child) {
          this.child = null; this.url = null;
          void Promise.allSettled([...this.turns].map(([turnId, threadId]) => this.transport.request("turn/interrupt", { threadId, turnId })));
          this.turns.clear(); this.threads.clear(); this.toolRequests.clear();
          if (this.state === "running") { this.state = "error"; this.error = "Codex workbench stopped."; }
        }
      });
      return await new Promise((resolve, reject) => {
        let output = ""; let settled = false;
        const timer = setTimeout(() => { child.kill("SIGTERM"); reject(Error("Codex workbench profile did not report readiness within 60 seconds.")); }, 60_000);
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", chunk => {
          output = `${output}${chunk}`.slice(-16384);
          const match = output.replace(/\u001b\[[0-9;]*m/g, "").match(/https?:\/\/127\.0\.0\.1:\d+[^\s]*/);
          if (!match || settled || generation !== this.generation) return;
          settled = true; clearTimeout(timer); this.url = new URL(match[0]).href; this.state = "running"; resolve(this.read());
        });
        // Drain diagnostics without exposing credentials or model input to the UI.
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", chunk => { this.diagnostic = `${this.diagnostic}${chunk}`.slice(-12000); });
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", () => { clearTimeout(timer); reject(Error("Codex workbench profile exited before readiness.")); });
      });
    } catch (error) {
      error.diagnostic = this.diagnostic;
      if (generation === this.generation) { await this.stop(); this.state = "error"; this.error = error.message; }
      throw error;
    }
  }
  async execute({ operation }) {
    if (operation === "start") return this.start();
    if (operation === "stop") { await this.stop(); return this.read(); }
    throw Error("Use the official DSH workbench to manage sessions, presets and teamwork.");
  }
  async stop() {
    this.generation++; this.state = "stopped"; this.url = null; this.error = null;
    const child = this.child;
    await Promise.allSettled([...this.turns].map(([turnId, threadId]) => this.transport.request("turn/interrupt", { threadId, turnId })));
    if (child && child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM");
    });
    this.turns.clear(); this.threads.clear(); this.toolRequests.clear();
    return this.read();
  }
  dispose() { return this.stop(); }
}

