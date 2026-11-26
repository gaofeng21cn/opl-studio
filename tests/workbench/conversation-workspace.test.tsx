import { readFileSync } from "node:fs";
import { Component, act, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { NativeDirectoryFlow } from "@deepseek-ai/dsh-client-ui-directory-picker-native/src/client/flow.ts";
import { Context } from "@deepseek-ai/cordis";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import {
  SlotCoreContext,
  StudioContext,
  useStudioDirectoryFlow,
  type StudioContextValue
} from "../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext.tsx";

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sourceSection = (source: string, start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end));

test("native directory picking is a direct pinned cohort dependency", () => {
  // Given the Workspace picker composition and its DSH package binding.
  const dependency = "@deepseek-ai/dsh-client-ui-directory-picker-native";
  const version = "0.2.3-alpha.2";
  const spec = `${dependency}@${version}`;
  const pkg = JSON.parse(readSource("package.json"));
  const lock = JSON.parse(readSource("package-lock.json"));
  const sourceManifest = JSON.parse(readSource("packages/dsh-adapters/deepseekHarnessSourceManifest.json"));
  const evidence = JSON.parse(readSource("src/candidateContractEvidence.json"));

  // When every packaging owner is inspected.
  // Then the picker is declared directly rather than reached through a transitive install.
  expect(pkg.dependencies[dependency]).toBe(version);
  expect(lock.packages[""].dependencies[dependency]).toBe(version);
  expect(lock.packages[`node_modules/${dependency}`].version).toBe(version);
  expect(sourceManifest.application_host.package_cohort).toContain(spec);
  expect(evidence.reused_oss_module_policy.direct_reuse_modules).toContain(spec);
});

test("native directory picking uses the package public source entrypoint", () => {
  // Given the static composition importing the official flow.
  const navigation = readSource("plugins/core/opl-studio-client/src/client/composition/slotHost/navigationSlots.tsx");
  const picker = JSON.parse(readFileSync(
    new URL("../../node_modules/@deepseek-ai/dsh-client-ui-directory-picker-native/package.json", import.meta.url),
    "utf8"
  ));

  // When its import and package exports are inspected.
  // Then the flow comes from the package, not a vendor-relative or transitive path.
  expect(navigation).toContain('from "@deepseek-ai/dsh-client-ui-directory-picker-native/src/client/flow.ts"');
  expect(navigation).not.toMatch(/from\s+"[^"]*vendor[^"]*directory-picker-native/);
  expect(picker.exports["./src/*"]).toBe("./src/*");
});

test("sidebar Workspace composition preserves the official renderSlot seam and hook order", () => {
  // Given the Studio sidebar and picker adapters.
  const navigation = readSource("plugins/core/opl-studio-client/src/client/composition/slotHost/navigationSlots.tsx");
  const sidebar = sourceSection(navigation, "export function SidebarWorkspacesSlot", "function RecentSessionsSection");

  // When the composed component is inspected.
  // Then the official browser retains its renderSlot seam.
  expect(sidebar).toContain("renderSlot={renderSlot}");
  expect(sidebar).toContain("useDirectoryFlow={useSidebarDirectoryFlow}");
  expect(sidebar).toContain("<WorkspaceBrowser");
});

test("blank hero and sidebar compose official directory-flow occupants", () => {
  // Given the current static DSH composition.
  const navigation = readSource("plugins/core/opl-studio-client/src/client/composition/slotHost/navigationSlots.tsx");
  const host = readSource("plugins/core/opl-studio-client/src/client/composition/dshSlotHost.tsx");

  // When the two picker surfaces are inspected.
  // Then both reuse official components and expose their native-flow holes.
  expect(navigation).toContain("<WorkspacePicker");
  expect(navigation).toContain("<NativeDirectoryFlow");
  expect(navigation).not.toContain("HeroWorkspaceSlot");
  expect(host).toContain('"conversation.hero.workspace.directoryFlow"');
  expect(host).toContain('"sidebar.workspaces.directoryFlow"');
});

test("adding directoryFlow must not remove official session-row child slots", () => {
  // Given the Studio sidebar.workspaces registration.
  const host = readSource("plugins/core/opl-studio-client/src/client/composition/dshSlotHost.tsx");
  const registration = sourceSection(host, 'register({ name: "sidebar.workspaces"', 'register({ name: "sidebar.settings"');

  // When its declared children are inspected.
  // Then the directory flow occupant keeps every official session-row child.
  expect(registration).toContain('"sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" }');
  expect(registration).toContain('"sidebar.workspaces.session.row.action": { kind: "list", scope: "root" }');
  expect(registration).toContain('"sidebar.session.row.leading": { kind: "list", scope: "root", inline: true }');
  expect(registration).toContain('"sidebar.session.row.trailing": { kind: "list", scope: "root", inline: true }');
  expect(registration).toContain('"sidebar.session.row.hover": { kind: "list", scope: "root" }');
});

test("new/open navigation resets pending state and first send owns the cwd override", () => {
  // Given the App navigation and submission implementations.
  const app = readSource("plugins/core/opl-studio-client/src/client/workbench/App.tsx");
  const open = sourceSection(app, "async function openThread(", "async function openCanonicalThreadRef(");
  const fresh = sourceSection(app, "function startNewChat()", "function threadById(");
  const send = sourceSection(app, "function sendCodexMessage(", "function startNewChat()");

  // When their workspace-state seams are inspected.
  // Then navigation clears pending state and submission derives first-send-only cwd.
  expect(open).toContain("resetConversationWorkspace(");
  expect(fresh).toContain("resetConversationWorkspace(");
  expect(send).toContain("cwd: firstSendCwd({");
});

let browser: Window;
let root: Root;
let mounted = false;
let originals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  browser = new Window({ url: "http://localhost/" });
  const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    Node: browser.Node,
    IS_REACT_ACT_ENVIRONMENT: true
  };
  originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function render(element: ReactElement) {
  await act(async () => { root.render(element); });
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });
  return { promise, resolve(value: T) { resolvePromise?.(value); } };
}

test("native flow picks once per open and reports through the latest owner", async () => {
  // Given one deferred native chooser and an open flow.
  const pending = deferred<string | null>();
  const picked: string[] = [];
  let calls = 0;
  const pick = () => { calls += 1; return pending.promise; };
  const props = {
    open: true,
    busy: false,
    onPicked: (path: string) => { picked.push(path); },
    onCancel: () => undefined,
    onError: () => undefined
  };
  await render(<NativeDirectoryFlow {...props} pick={pick} />);

  // When the owner rerenders as busy, closes, and later reopens.
  await render(<NativeDirectoryFlow {...props} busy pick={pick} />);
  expect(calls).toBe(1);
  await act(async () => { pending.resolve("/tmp/picked"); await pending.promise; });
  await render(<NativeDirectoryFlow {...props} open={false} pick={pick} />);
  await render(<NativeDirectoryFlow {...props} pick={pick} />);

  // Then the first open adopts once and the new open starts one new pick.
  expect(picked).toEqual(["/tmp/picked", "/tmp/picked"]);
  expect(calls).toBe(2);
});

test("native flow reports cancellation without adopting a path", async () => {
  // Given a chooser that returns no directory.
  let cancelled = 0;
  let picked = 0;

  // When the native flow settles.
  await render(<NativeDirectoryFlow
    open busy={false} pick={() => Promise.resolve(null)}
    onPicked={() => { picked += 1; }} onCancel={() => { cancelled += 1; }} onError={() => undefined}
  />);

  // Then only cancellation is reported.
  expect(cancelled).toBe(1);
  expect(picked).toBe(0);
});

test("native flow routes picker failure to the owner error surface", async () => {
  // Given a failing chooser.
  const errors: string[] = [];

  // When the native flow settles.
  await render(<NativeDirectoryFlow
    open busy={false} pick={() => Promise.reject(new Error("chooser unavailable"))}
    onPicked={() => undefined} onCancel={() => undefined} onError={message => { errors.push(message); }}
  />);

  // Then its error reaches the owner unchanged.
  expect(errors).toEqual(["chooser unavailable"]);
});

test("native flow discards a settlement that arrives after unmount", async () => {
  // Given an open chooser whose answer is still pending.
  const pending = deferred<string | null>();
  const outcomes: string[] = [];
  await render(<NativeDirectoryFlow
    open busy={false} pick={() => pending.promise}
    onPicked={path => { outcomes.push(path); }} onCancel={() => { outcomes.push("cancel"); }} onError={message => { outcomes.push(message); }}
  />);

  // When the occupant unmounts before the chooser answers.
  await act(async () => root.unmount());
  mounted = false;
  await act(async () => { pending.resolve("/tmp/late"); await pending.promise; });

  // Then the dead occupant reports no outcome.
  expect(outcomes).toEqual([]);
});

const DIRECTORY_FLOW_SLOT = "conversation.hero.workspace.directoryFlow";

function studioSurface(directoryPickerAvailable: boolean): StudioContextValue {
  return {
    directoryPickerAvailable,
    narrow: false,
    detailsOpen: false,
    toggleSidebar: () => undefined,
    closeDetails: () => undefined
  } as unknown as StudioContextValue;
}

function DirectoryFlowProbe() {
  const visible = useStudioDirectoryFlow(DIRECTORY_FLOW_SLOT, occupied => occupied);
  return <output data-directory-flow={String(visible)}>{String(visible)}</output>;
}

class CaptureBoundary extends Component<{ onError(error: unknown): void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(error: unknown): void { this.props.onError(error); }
  override render(): ReactNode { return this.state.failed ? <p data-crashed="true" /> : this.props.children; }
}

test("directory-flow occupancy survives capability toggles without a hook-order crash", async () => {
  // Given a real slot registry whose conversation hero seat is declared.
  const ctx = new Context();
  new SlotRegistry(ctx);
  const slots = ctx.get("slots") as SlotRegistry;
  const shell = await ctx.plugin({
    apply(child: Context) {
      (child.get("slots") as SlotRegistry).register(
        { name: "root", children: { [DIRECTORY_FLOW_SLOT]: { kind: "single", scope: "root" } } },
        () => null
      );
    }
  });
  const errors: unknown[] = [];
  const surface = (directoryPickerAvailable: boolean) => (
    <CaptureBoundary onError={error => { errors.push(error); }}>
      <StudioContext.Provider value={studioSurface(directoryPickerAvailable)}>
        <SlotCoreContext.Provider value={slots}>
          <DirectoryFlowProbe />
        </SlotCoreContext.Provider>
      </StudioContext.Provider>
    </CaptureBoundary>
  );
  const visible = () => document.querySelector("[data-directory-flow]")?.getAttribute("data-directory-flow");

  try {
    // When a blank Workspace renders before the native picker capability exists.
    await render(surface(false));

    // Then the gated selection is off while the occupancy hook already runs.
    expect(errors).toEqual([]);
    expect(visible()).toBe("false");

    // And an occupant arriving under a disabled capability keeps the gate off.
    let occupy = slots.register({ name: DIRECTORY_FLOW_SLOT }, () => null);
    await act(async () => {});
    expect(errors).toEqual([]);
    expect(visible()).toBe("false");

    // When the capability turns on for the same mounted consumer.
    await render(surface(true));

    // Then the occupied selection shows without any hook-count/order crash.
    expect(errors).toEqual([]);
    expect(visible()).toBe("true");

    // And flipping occupancy and the capability on the same instance keeps the selection honest.
    await act(async () => { occupy(); });
    expect(errors).toEqual([]);
    expect(visible()).toBe("false");

    occupy = slots.register({ name: DIRECTORY_FLOW_SLOT }, () => null);
    await act(async () => {});
    expect(errors).toEqual([]);
    expect(visible()).toBe("true");

    await render(surface(false));
    expect(errors).toEqual([]);
    expect(visible()).toBe("false");

    await render(surface(true));
    expect(errors).toEqual([]);
    expect(visible()).toBe("true");

    occupy();
    await act(async () => {});
    expect(errors).toEqual([]);
    expect(visible()).toBe("false");
  } finally {
    await act(async () => root.unmount());
    mounted = false;
    await shell.dispose();
    await ctx.fiber.dispose();
  }
});
