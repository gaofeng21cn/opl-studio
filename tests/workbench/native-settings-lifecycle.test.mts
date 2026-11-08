import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { Context } from "@deepseek-ai/cordis";
import { SlotRegistry } from "../../src/vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { createEcosystemLocale, installSettingsSearch } from "../../src/integrations/deepseek-harness/ecosystemClients.ts";

function settingsSearchPlugin() {
  let plugin: any;
  runInNewContext(readFileSync(new URL("../../node_modules/@objectivex666/dsh-settings-search/lib/client.js", import.meta.url), "utf8"), {
    window: { __ModuleLoader__: { load(registration: any) { plugin = registration.factory((name: string) => {
      if (name !== "react") throw new Error(`Unexpected client dependency: ${name}`);
      return React;
    }); } } },
  });
  return plugin;
}

test("settings search uses native declaration injection and unloads with its Cordis owner", async () => {
  const ctx = new Context();
  new SlotRegistry(ctx);
  const slots = ctx.get("slots") as SlotRegistry;
  const locale = createEcosystemLocale(() => "en");
  const disposeSearch = await installSettingsSearch(ctx, settingsSearchPlugin(), { locale, readSections: () => [{ options: { id: "app", label: "App preferences" } }] });
  const declareHeader = () => ctx.plugin({
    name: "settings-shell-fixture",
    apply(child: Context) {
      child.get("slots").register({ name: "root", children: { "settings.header": { kind: "single", scope: "root" } } }, () => null);
    },
  });
  const shell = await declareHeader();
  expect(slots.entries("settings.header")).toHaveLength(1);
  expect(locale.bind("settings-search-v5")("title")).toBe("Settings");
  await shell.dispose();
  const nextShell = await declareHeader();
  expect(slots.entries("settings.header")).toHaveLength(1);
  await disposeSearch();
  expect(slots.entries("settings.header")).toHaveLength(0);
  expect(locale.bind("settings-search-v5")("title")).toBe("title");
  await nextShell.dispose();
  const finalShell = await declareHeader();
  expect(slots.entries("settings.header")).toHaveLength(0);
  await finalShell.dispose();
  await ctx.fiber.dispose();
});

test("projected search rows stay scoped while native registrations belong to the consumer fiber", async () => {
  const ctx = new Context();
  new SlotRegistry(ctx);
  const slots = ctx.get("slots") as SlotRegistry;
  const shell = await ctx.plugin({ apply(child: Context) {
    child.get("slots").register({ name: "root", children: { "settings.header": { kind: "single", scope: "root" }, "settings.section": { kind: "list", scope: "root" } } }, () => null);
  } });
  const locale = createEcosystemLocale(() => "en");
  const rows = [{ options: { id: "app", label: "App preferences" } }];
  let searchCtx: Context | undefined;
  let rowsRead: unknown;
  const dispose = await installSettingsSearch(ctx, { inject: ["slots", "locale"], apply(child) {
    expect(Context.is(child)).toBe(true);
    searchCtx = child;
    rowsRead = child.get("slots").entries("settings.section");
    child.get("slots").inject("settings.header", () => child.get("slots").register({ name: "settings.header", locale: "fixture" }, () => null));
  } }, { locale, readSections: () => rows });
  expect(rowsRead).toBe(rows);
  expect(slots.entries("settings.section")).toHaveLength(0);
  expect(slots.entries("settings.header")).toHaveLength(1);
  await searchCtx!.fiber.dispose();
  expect(slots.entries("settings.header")).toHaveLength(0);
  await dispose();
  await shell.dispose();
  await ctx.fiber.dispose();
});


test("settings search follows native slots availability and restarts without duplicate registrations", async () => {
  const ctx = new Context();
  const startSlots = () => ctx.plugin({ name: "native-slots-fixture", apply(child: Context) {
    new SlotRegistry(child);
    child.get("slots", false).register({ name: "root", children: { "settings.header": { kind: "single", scope: "root" } } }, () => null);
  } });
  const provider = await startSlots();
  const locale = createEcosystemLocale(() => "en");
  const dispose = await installSettingsSearch(ctx, settingsSearchPlugin(), { locale, readSections: () => [] });
  expect(ctx.get("slots").entries("settings.header")).toHaveLength(1);
  await provider.dispose();
  expect(locale.bind("settings-search-v5")("title")).toBe("title");
  const replacement = await startSlots();
  // Cordis resolves service dependents asynchronously after the provider activates.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(ctx.get("slots").entries("settings.header")).toHaveLength(1);
  expect(locale.bind("settings-search-v5")("title")).toBe("Settings");
  await dispose();
  expect(ctx.get("slots").entries("settings.header")).toHaveLength(0);
  await replacement.dispose();
  await ctx.fiber.dispose();
});
