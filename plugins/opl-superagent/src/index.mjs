import { createRequire } from "node:module";
import { mkdir, symlink, readlink, unlink } from "node:fs/promises";
import path from "node:path";
import { CodexWorkbenchProfile } from "@one-person-lab/opl-codex-agents/workbench-profile";

export const name = "opl-superagent";
export const inject = ["oplStudioHostOptions", "oplCodexNative"];

/** Official Superagent keeps its work; the App's existing Codex server executes its sessions. */
export class SuperagentProfile extends CodexWorkbenchProfile {
  constructor(options, codex) {
    super(options, codex, "superagent");
    this.superagentEngine = path.dirname(createRequire(import.meta.url).resolve("dsh-superagent/package.json"));
  }
  read() { return { ...super.read(), teamDependency: false, executor: "codex" }; }
  async prepare(defaultModel) {
    const patch = await super.prepare(defaultModel);
    const link = path.join(this.home, "profiles/web/node_modules/dsh-superagent");
    await mkdir(path.dirname(link), { recursive: true });
    try { if (await readlink(link) !== this.superagentEngine) { await unlink(link); await symlink(this.superagentEngine, link, "dir"); } }
    catch (error) { if (error.code !== "ENOENT") throw error; await symlink(this.superagentEngine, link, "dir"); }
    return patch;
  }
}

export function apply(ctx) {
  const service = new SuperagentProfile(ctx.oplStudioHostOptions, ctx.oplCodexNative);
  ctx.provide("oplSuperagent", service);
  ctx.effect(() => () => service.stop(), "independent Codex Superagent profile");
}
