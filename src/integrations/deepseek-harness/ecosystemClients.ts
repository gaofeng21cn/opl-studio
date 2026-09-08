import * as React from "react";

type Registration = { id: string; factory(require: (id: string) => unknown): unknown };
type ClientPlugin = { apply(context: unknown): void; inject?: string[] };
type ModuleSystem = { import(id: string): Promise<unknown> };
type RegistrationTarget = { mode: "queue" | "live"; pendingQueue: Registration[]; load(registration: Registration): void };

// This is the carrier's reviewed client cohort, not an install/discovery registry.
const clients = {
  "dsh-file-viewer": { file: "dsh-file-viewer.js", revision: "0.3.3" },
  "@objectivex666/dsh-settings-search": { file: "dsh-settings-search.js", revision: "1.2.0" },
} as const;
export type EcosystemClientId = keyof typeof clients;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Cannot load ecosystem client: ${url}`)); };
    document.head.append(script);
  });
}

let moduleSystem: Promise<ModuleSystem> | undefined;
let adoptedModuleSystem: ModuleSystem | undefined;
const arrivals = new Map<EcosystemClientId, Promise<void>>();

/** Web boot already owns the DSH module system; desktop supplies it at first use. */
export function adoptEcosystemModuleSystem(existing: unknown): void {
  if (!existing || typeof (existing as ModuleSystem).import !== "function") return;
  if (adoptedModuleSystem === existing) return;
  if (moduleSystem) throw new Error("The ecosystem module system was initialized before the DSH host");
  adoptedModuleSystem = existing as ModuleSystem;
  moduleSystem = Promise.resolve(existing as ModuleSystem);
}

async function createModuleSystem(): Promise<ModuleSystem> {
  const target: RegistrationTarget = { mode: "queue", pendingQueue: [], load(registration) { this.pendingQueue.push(registration); } };
  const hostWindow = window as unknown as { __ModuleLoader__?: RegistrationTarget };
  if (hostWindow.__ModuleLoader__?.mode === "live") throw new Error("DSH client modules are already booted by the DSH host; this optional carrier is deferred until the next module graph admission");
  hostWindow.__ModuleLoader__ = target;
  const asset = (file: string) => new URL(`./ecosystem/${file}`, document.baseURI).href;
  await loadScript(asset("dsh-client-modules.js"));
  const bootstrapId = "@deepseek-ai/dsh-client-modules";
  const index = target.pendingQueue.findIndex((row) => row.id === bootstrapId);
  if (index < 0) throw new Error("The DSH module bootstrap did not register");
  const bootstrap = target.pendingQueue.splice(index, 1)[0];
  const exports = bootstrap.factory((id) => { throw new Error(`Unexpected DSH bootstrap dependency: ${id}`); }) as {
    createClientModuleSystem(target: RegistrationTarget, bootstrap: { id: string; exports: unknown }, options: unknown): ModuleSystem;
  };
  if (typeof exports.createClientModuleSystem !== "function") throw new Error("The DSH module bootstrap is incompatible");
  const entries = Object.entries(clients).map(([id, row]) => ({ id, url: `${asset(row.file)}?rev=${row.revision}`, rev: row.revision, inject: [], external: ["react"] }));
  // Use the upstream module system for factory arrival and React singleton resolution.
  // OPL only supplies the approved static carrier graph and existing host services.
  return exports.createClientModuleSystem(target, { id: bootstrapId, exports }, {
    boot: { rev: "opl-studio-ecosystem-v1", entries, batches: entries.map((row) => ({ phase: "application", url: row.url, rev: row.rev, entries: [row.id] })) },
    staticModules: { react: React },
    loadBundle: loadScript,
  });
}

export async function loadEcosystemClient(id: EcosystemClientId): Promise<ClientPlugin> {
  moduleSystem ??= createModuleSystem().catch((error) => { moduleSystem = undefined; throw error; });
  const modules = await moduleSystem;
  // Web's existing manifest need not invent duplicate plugin graph entries.
  // The reviewed factory registers with that same upstream module owner.
  if (!arrivals.has(id)) {
    arrivals.set(id, loadScript(new URL(`./ecosystem/${clients[id].file}?rev=${clients[id].revision}`, document.baseURI).href)
      .catch((error) => { arrivals.delete(id); throw error; }));
  }
  await arrivals.get(id);
  const plugin = await modules.import(id) as ClientPlugin;
  if (typeof plugin?.apply !== "function") throw new Error(`Invalid ecosystem client plugin: ${id}`);
  return plugin;
}

export type EcosystemTranslate = (key: string, values?: Record<string, unknown>) => string;
export type EcosystemLocale = {
  bind(namespace: string): EcosystemTranslate;
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
  subscribe(listener: () => void): () => void;
  refresh(): void;
};

export function createEcosystemLocale(readLocale: () => "zh" | "en"): EcosystemLocale {
  const dictionaries = new Map<string, Record<string, Record<string, string>>>();
  const listeners = new Set<() => void>();
  return {
    bind: (namespace) => (key, values) => {
      let text = dictionaries.get(namespace)?.[readLocale()]?.[key] ?? dictionaries.get(namespace)?.en?.[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
      return text;
    },
    register(namespace, value) { dictionaries.set(namespace, value); return () => { dictionaries.delete(namespace); }; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh() { for (const listener of listeners) listener(); },
  };
}

export type EcosystemSlots = {
  entries(name: string): unknown[];
  subscribe(name: string, listener: () => void): () => void;
  register(options: Record<string, unknown>, component: React.ComponentType<any>): (() => void) | void;
  inject(name: string, activate: () => unknown): unknown;
};

export async function mountSettingsSearch({ slots, locale }: { slots: EcosystemSlots; locale: EcosystemLocale }): Promise<() => void> {
  const plugin = await loadEcosystemClient("@objectivex666/dsh-settings-search");
  const cleanup: (() => void)[] = [];
  plugin.apply({
    locale,
    slots: { ...slots, register(options: Record<string, unknown>, component: React.ComponentType<any>) {
      const dispose = slots.register(options, component);
      if (dispose) cleanup.push(dispose);
      return dispose;
    } },
    effect(callback: () => void | (() => void)) { const dispose = callback(); if (dispose) cleanup.push(dispose); },
  });
  return () => { for (const dispose of cleanup.reverse()) dispose(); };
}
