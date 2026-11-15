import { EventEmitter } from "node:events";

export const name = "opl-codex-parent-transport";
const CHANNEL = "opl-codex-parent.v1";

/** A transport reference, never another Codex App Server or execution owner. */
export class ParentTransport extends EventEmitter {
  constructor(channel = process, disconnected = () => {}) {
    super();
    if (!channel.send || !channel.connected) throw Error("Collaboration requires its parent Studio Host.");
    this.channel = channel;
    this.pending = new Map();
    this.next = 0;
    this.onMessage = message => {
      if (message?.channel !== CHANNEL) return;
      if (message.event === "serverRequest") { this.emit("serverRequest", message.value); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(Object.assign(Error(message.error.message), { code: message.error.code }));
      else pending.resolve(message.result);
    };
    this.onDisconnect = () => { this.dispose(); disconnected(); };
    channel.on("message", this.onMessage);
    channel.on("disconnect", this.onDisconnect);
  }
  call(method, ...args) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (!this.channel.connected) { this.pending.delete(id); reject(Error("Studio Host disconnected.")); return; }
      this.channel.send({ channel: CHANNEL, id, method, args }, error => {
        if (error) { this.pending.delete(id); reject(error); }
      });
    });
  }
  listModels(...args) { return this.call("listModels", ...args); }
  startThread(...args) { return this.call("startThread", ...args); }
  resumeThread(...args) { return this.call("resumeThread", ...args); }
  readThread(...args) { return this.call("readThread", ...args); }
  startTurn(...args) { return this.call("startTurn", ...args); }
  waitForTurn(...args) { return this.call("waitForTurn", ...args); }
  request(...args) { return this.call("request", ...args); }
  respondToServerRequest(id, response) {
    if (this.channel.connected) this.channel.send({ channel: CHANNEL, event: "toolResponse", id, response });
  }
  dispose() {
    this.channel.off("message", this.onMessage);
    this.channel.off("disconnect", this.onDisconnect);
    for (const pending of this.pending.values()) pending.reject(Error("Studio Host disconnected."));
    this.pending.clear();
    this.removeAllListeners();
  }
}

export function apply(ctx, config) {
  const transport = new ParentTransport(process, () => ctx.get("appExit")?.(0));
  ctx.provide("oplCodexNative", { transport });
  ctx.provide("oplCodexDefaultModel", config.defaultModel);
  ctx.provide("oplStudioHostOptions", { dshHome: config.parentHome, workspaceRoot: config.workspaceRoot });
  ctx.effect(() => () => transport.dispose(), "parent-owned Codex transport reference");
}

export { CHANNEL };
