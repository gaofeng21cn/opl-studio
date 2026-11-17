import * as React from "react";
import { Context, Service } from "@deepseek-ai/cordis";
import type { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry";
type ClientPlugin = { apply(context: Context): void; inject?: string[] };

export type EcosystemTranslate = (key: string, values?: Record<string, unknown>) => string;
export type EcosystemLocale = {
  readonly getSnapshot: () => { revision: number };
  bind(namespace: string): EcosystemTranslate;
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
  subscribe(listener: () => void): () => void;
  refresh(): void;
};

export function createEcosystemLocale(readLocale: () => "zh" | "en"): EcosystemLocale {
  const dictionaries = new Map<string, Record<string, Record<string, string>>>();
  const listeners = new Set<() => void>();
  let snapshot = { revision: 0 };
  const refresh = () => {
    snapshot = { revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    bind: (namespace) => (key, values) => {
      let text = dictionaries.get(namespace)?.[readLocale()]?.[key] ?? dictionaries.get(namespace)?.en?.[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
      return text;
    },
    register(namespace, value) { dictionaries.set(namespace, value); refresh(); return () => { dictionaries.delete(namespace); refresh(); }; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
  };
}

type SettingsSearchProjection = {
  locale: EcosystemLocale;
  readSections(): readonly unknown[];
};

/** Project App search rows while keeping registration and lifetime in DSH. */
class SettingsSearchSlots extends Service {
  constructor(ctx: Context, private readonly sourceScope: symbol, private readonly projection: SettingsSearchProjection) {
    super(ctx, "slots");
  }

  private nativeSlots(): SlotRegistry {
    // Resolve through the calling plugin's Context, retaining its fiber owner.
    return this.ctx.isolate("slots", this.sourceScope).get("slots") as SlotRegistry;
  }

  entries(name: string): readonly unknown[] {
    return name === "settings.section" ? this.projection.readSections() : this.nativeSlots().entries(name as never);
  }

  subscribe(name: string, listener: () => void): () => void {
    const unsubscribeSlots = this.nativeSlots().subscribe(name as never, listener);
    const unsubscribeProjection = this.projection.locale.subscribe(listener);
    return () => { unsubscribeSlots(); unsubscribeProjection(); };
  }

  register(options: Record<string, unknown>, Component: React.ComponentType<any>): () => void {
    const { locale: namespace, ...registration } = options;
    const t = this.projection.locale.bind(String(namespace));
    return this.nativeSlots().register(
      { ...registration, registrant: "@objectivex666/dsh-settings-search" } as never,
      ((props: Record<string, unknown>) => React.createElement(Component, { ...props, t })) as never,
    );
  }

  inject(name: string, activate: () => (() => void) | Iterable<() => void, void, void>): () => void {
    return this.nativeSlots().inject(name as never, activate);
  }
}

/** Install the ecosystem implementation beneath the existing Cordis owner. */
export async function installSettingsSearch(ctx: Context, plugin: ClientPlugin, projection: SettingsSearchProjection): Promise<() => Promise<void>> {
  const sourceScope = ctx[Context.isolate].slots;
  if (!sourceScope || !ctx.get("slots")) throw new Error("Settings search requires the DSH slots service");
  const bridge = ctx.plugin({
    name: "opl-settings-search-projection",
    inject: ["slots"],
    async apply(child: Context) {
      const scope = child.isolate("slots").isolate("locale");
      const services = await scope.plugin({
        name: "opl-settings-search-services",
        apply(serviceContext: Context) {
          new SettingsSearchSlots(serviceContext, sourceScope, projection);
          serviceContext.provide("locale", projection.locale);
        },
      });
      // The versioned client compatibility patch keeps the local-search scope.
      await services.ctx.plugin(plugin);
    },
  });
  try {
    await bridge;
    return () => bridge.dispose();
  } catch (error) {
    await bridge.dispose();
    throw error;
  }
}

export async function mountSettingsSearch({ ctx, ...projection }: SettingsSearchProjection & { ctx: Context }): Promise<() => Promise<void>> {
  const { default: plugin } = await import("virtual:opl-settings-search");
  return installSettingsSearch(ctx, plugin, projection);
}
