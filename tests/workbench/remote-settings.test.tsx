import React, { act } from "react";
let createRoot: typeof import("react-dom/client").createRoot;
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { McpAppsClientContext } from "../../plugins/opl-mcp-apps/src/client/plugin";
import { installWorkspaceClientPlugin } from "../../src/composition/workspaceClientPlugin";
import { SettingsPluginSections } from "../../src/composition/SettingsPluginSections";
import { CapabilitiesSettingsPage } from "../../src/workbench/settings/pages/CapabilitiesSettingsPage";
import { ServicesSettingsPage } from "../../src/workbench/settings/pages/ServicesSettingsPage";
import { ResourcesSettingsPage } from "../../src/workbench/settings/pages/ResourcesSettingsPage";
import { ProjectedContribution } from "../../src/composition/contributionComponents";
import { readUiContributionsProjection, settingsEntriesForDestination, type OplContributionSlotOwner } from "../../src/composition/contributionProjection";

let browser: Window;
let root: ReturnType<typeof createRoot>;
const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
let originals: Map<string, PropertyDescriptor | undefined>;
beforeEach(async () => {
  browser = new Window({ url: "http://localhost/" });
  originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'window' ? browser : (browser as any)[key] });
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); browser.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
});

const entries = readUiContributionsProjection({ ui_contributions: { surface_kind: 'opl_app_ui_contributions_projection.v1', entries: [{
  contribution_key: 'remote-component:channel', contribution_id: 'channel', package_id: 'remote-component', slot: 'settings.section', contribution_kind: 'view', trust_tier: 'declarative', scope: 'root',
  view: { view_id: 'channel', view_type: 'channel_access', title_i18n: { en: 'Weixin', 'zh-CN': '微信' }, data_ref: 'channel#state', command_ids: ['connect', 'submit'] },
  commands: [{ command_id: 'connect', label_i18n: { en: 'Connect', 'zh-CN': '扫码连接' }, action_ref: 'channel#connect', confirmation_required: false }, { command_id: 'submit', label_i18n: { en: 'Verify', 'zh-CN': '验证并继续' }, action_ref: 'channel#submit', confirmation_required: false }], badges: []
}] } }).entries;
const pageProps = { settings: { locale: 'zh' }, zh: true, projection: null, actionBusyKey: null, dockerDiagnostic: null, onAction: () => {} } as any;

test('remote controls mount in Settings even when their package is a runtime component', async () => {
  const reads: unknown[] = [];
  const state = { schema_version: 'opl-app-channel-access.v1', status: 'available', channel_id: 'weixin', connection: { state: 'disconnected' }, actions: [{ command_id: 'connect', input: { channel_id: 'weixin' } }], pending_pairings: [], authorized_users: [] };
  const actions: unknown[] = [];
  const owner = { locale: 'zh', actionAvailable: true, refreshRevision: 0, readData: async (_entry: unknown, input: unknown) => { reads.push(input); return state; }, onAction: (...args: unknown[]) => { actions.push(args); } } as OplContributionSlotOwner;
  // Catalog scope must never be needed to choose or mount remote settings.
  const selected = settingsEntriesForDestination(entries, "resources");
  await act(async () => root.render(<ResourcesSettingsPage {...pageProps} renderSettingsContributions={() => <>{selected.map(entry => <ProjectedContribution key={entry.contributionKey} entry={entry} owner={owner} />)}</>} />));
  expect(document.body.textContent).toContain('消息与远程连接');
  expect(document.body.textContent).toContain('微信');
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === '扫码连接')!;
  await act(async () => button.click());
  expect(reads.length).toBeGreaterThan(0);
  expect((actions[0] as any[])[2]).toEqual({ channel_id: 'weixin' });
});

test('remote Settings retains an actionable setup path without any provider', async () => {
  let opened = '';
  await act(async () => root.render(<ResourcesSettingsPage {...pageProps} onOpenSoftwareCenter={(section: string) => { opened = section; }} />));
  expect(document.body.textContent).toContain('微信及其他远程扩展');
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === '管理远程扩展')!;
  await act(async () => button.click());
  expect(opened).toBe('applications');
});

test('PIN form preserves leading zeroes and never sends PIN values in subsequent reads', async () => {
  const reads: unknown[] = []; const actions: any[][] = [];
  const state = { schema_version: 'opl-app-channel-access.v1', status: 'available', channel_id: 'weixin', connection: { state: 'pin_required', verification_challenge: { challenge_id: 'current', expires_at_ms: Date.now() + 60000, retry: false } }, actions: [{ command_id: 'submit', input: { channel_id: 'weixin', challenge_id: 'current' } }], pending_pairings: [], authorized_users: [], refresh_after_ms: 250 };
  const owner = { locale: 'zh', actionAvailable: true, refreshRevision: 0, readData: async (_entry: unknown, input: unknown) => { reads.push(input); return state; }, onAction: (...args: unknown[]) => { actions.push(args); } } as OplContributionSlotOwner;
  await act(async () => root.render(<ProjectedContribution entry={entries[0]!} owner={owner} />));
  const input = document.querySelector('input')!;
  expect(input.type).toBe('text'); expect(input.inputMode).toBe('numeric');
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')!.set!.call(input, '012345');
    input.dispatchEvent(new browser.Event('input', { bubbles: true }) as any);
    input.dispatchEvent(new browser.Event('change', { bubbles: true }) as any);
  });
  await act(async () => document.querySelector('form')!.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }) as any));
  expect(actions[0]?.[2]).toEqual({ channel_id: 'weixin', challenge_id: 'current', verify_code: '012345' });
  expect(input.value).toBe('');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
  expect(JSON.stringify(reads)).not.toContain('012345');
});

test('software and component details retain ordinary configuration and opt-in technical activity', () => {
  const channel = entries[0]!;
  const service = { ...channel, contributionKey: 'component:health', packageId: 'component', view: { ...channel.view!, viewType: 'service_status' } };
  const activity = { ...service, contributionKey: 'component:doctor', view: { ...service.view, viewType: 'activity_log' } };
  expect(settingsEntriesForDestination([channel, service, activity], "services", false)).toEqual([service]);
  expect(settingsEntriesForDestination([channel, service, activity], "services", true)).toEqual([service, activity]);
  expect(settingsEntriesForDestination([channel], "capabilities", true)).toEqual([]);
  expect(settingsEntriesForDestination([channel, service, activity], "resources")).toEqual([channel]);
  const disabled = readUiContributionsProjection({ agent_packages: { directory: { entries: [{ package_id: channel.packageId, app_enabled: false }] } }, ui_contributions: { surface_kind: 'opl_app_ui_contributions_projection.v1', entries: [{ contribution_key: channel.contributionKey, contribution_id: channel.contributionId, package_id: channel.packageId, slot: 'settings.section' }] } });
  expect(settingsEntriesForDestination(disabled.entries, "resources")).toHaveLength(0);
});


test('plugin configuration uses the shared renderer only while its Settings group is expanded', async () => {
  let mounts = 0;
  const entry = { ...entries[0]!, view: { ...entries[0]!.view!, viewType: 'service_status' } };
  const renderEntry = () => { mounts++; return <button type="button">真实配置操作</button>; };
  await act(async () => root.render(<SettingsPluginSections entries={[entry]} labels={new Map([[entry.packageId, '第三方扩展']])} renderEntry={renderEntry} collapsible />));
  expect(mounts).toBe(0);
  expect(document.querySelector('summary')?.textContent).toBe('第三方扩展');
  const details = document.querySelector('details')!;
  await act(async () => { details.open = true; details.dispatchEvent(new browser.Event('toggle') as any); });
  expect(mounts).toBeGreaterThan(0);
  expect(document.body.textContent).toContain('真实配置操作');
  await act(async () => { details.open = false; details.dispatchEvent(new browser.Event('toggle') as any); });
  expect(document.querySelector('button')).toBeNull();
  await act(async () => root.render(<SettingsPluginSections entries={[]} labels={new Map()} renderEntry={renderEntry} collapsible />));
  expect(document.querySelector('details')).toBeNull();
});


test('operational views never mount or read in Settings and the previous entry opens the common workspace', async () => {
  let workspaces = 0;
  const operationTypes = ['list_detail', 'timeline', 'approval_diff', 'task_board', 'artifact_view'];
  const operations = operationTypes.map(viewType => ({...entries[0]!, view: {...entries[0]!.view!, viewType}}));
  for (const destination of ['resources', 'services', 'capabilities'] as const) {
    expect(settingsEntriesForDestination(operations, destination, true)).toHaveLength(0);
  }
  await act(async () => root.render(<CapabilitiesSettingsPage {...pageProps} model={{managedCompanions: [], packageLifecycle: []} as any} capabilityCatalog={{plugins: [], skills: [], apps: [], errors: []} as any} onOpenAppWorkspace={() => {workspaces++;}} />));
  expect(document.body.textContent).not.toContain('扩展设置');
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === '打开应用工作台')!;
  await act(async () => button.click());
  expect(workspaces).toBe(1);
});

test('service contributions mount through the actual maintenance page', async () => {
  let destination = '';
  await act(async () => root.render(<ServicesSettingsPage {...pageProps} locale="zh-CN" renderSettingsContributions={value => {destination = value; return <button type="button">设备状态操作</button>;}} />));
  expect(destination).toBe('services');
  expect(document.body.textContent).toContain('服务与设备');
  expect(document.body.textContent).toContain('设备状态操作');
});


test('one workspace entry uses the common MCP host and preserves task identity and return navigation', async () => {
  let Page: React.ComponentType = () => null;
  let opened = '';
  const surface = {locale: 'zh', currentThreadId: 'thread-1', openPrimaryView: (view: string) => {opened = view;}, mcpApps: {bridge: {}}, uiContributions: {entries}, contributionOwner: {readData: () => {throw new Error('a parallel module reader must not run');}}} as any;
  const dispose = installWorkspaceClientPlugin({register(options: any, component: any) {if (options.name === 'main') Page = component; return () => {};}} as any, () => surface);
  const client = {Workspace: (props: any) => <button type="button" onClick={props.onConversation}>返回对话</button>, TaskWorkbench: (props: any) => <p>{props.itemId}:{props.viewId}:{props.threadId}:{props.revision}</p>} as any;
  await act(async () => root.render(<McpAppsClientContext.Provider value={client}><Page /></McpAppsClientContext.Provider>));
  expect(document.body.textContent).not.toContain('模块视图');
  await act(async () => document.querySelector('button')!.click());
  expect(opened).toBe('conversation');
  surface.mcpApps.task = {itemId: 'task-1', viewId: 'review'};
  await act(async () => root.render(<McpAppsClientContext.Provider value={client}><Page /></McpAppsClientContext.Provider>));
  expect(document.body.textContent).toContain('task-1:review:thread-1');
  await act(async () => (document.querySelector('button[aria-label="刷新"]') as HTMLButtonElement).click());
  expect(document.body.textContent).toContain('task-1:review:thread-1:1');
  await act(async () => (document.querySelector('button[aria-label="返回运行状态"]') as HTMLButtonElement).click());
  expect(opened).toBe('runtime');
  surface.mcpApps = undefined;
  await act(async () => root.render(<McpAppsClientContext.Provider value={client}><Page /></McpAppsClientContext.Provider>));
  const manage = [...document.querySelectorAll('button')].find(button => button.textContent === '打开软件中心')!;
  await act(async () => manage.click());
  expect(opened).toBe('applications');
  dispose();
});
