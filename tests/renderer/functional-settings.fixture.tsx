import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../plugins/opl-studio-client/src/client/integrations/deepseek-harness/theme";
import { codexWorkbenchStyles } from "../../plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyles";
import { ResourcesSettingsPage } from "../../plugins/opl-studio-client/src/client/workbench/settings/pages/ResourcesSettingsPage";
import { ServicesSettingsPage } from "../../plugins/opl-studio-client/src/client/workbench/settings/pages/ServicesSettingsPage";
import { CapabilitiesSettingsPage } from "../../plugins/opl-studio-client/src/client/workbench/settings/pages/CapabilitiesSettingsPage";
import { ProjectedContribution } from "../../plugins/opl-studio-client/src/client/composition/contributionComponents";
import { readUiContributionsProjection, settingsEntriesForDestination } from "../../plugins/opl-studio-client/src/client/composition/contributionProjection";
import { McpAppWorkspace } from "../../plugins/opl-mcp-apps/src/client/McpAppWorkspace";
import { McpTaskWorkbench } from "../../plugins/opl-mcp-apps/src/client/McpTaskWorkbench";
import { McpAppsClientContext } from "../../plugins/opl-studio-client/src/client/composition/mcpAppsClient";
import { installWorkspaceClientPlugin } from "../../plugins/opl-studio-client/src/client/composition/workspaceClientPlugin";

const entries = readUiContributionsProjection({ui_contributions: {surface_kind: 'opl_app_ui_contributions_projection.v1', entries: [
  ['channel', 'channel_access', '微信'], ['service', 'service_status', '设备服务'], ['inbox', 'list_detail', '收件箱'],
  ['review', 'approval_diff', '内容审核'], ['artifacts', 'artifact_view', '制作产物']
].map(([id, type, title]) => ({contribution_key: `example:${id}`, contribution_id: id, package_id: 'example', slot: 'settings.section', scope: 'root', contribution_kind: 'view',
  view: {view_id: id, view_type: type, title_i18n: {'zh-CN': title}, data_ref: `example#${id}`}, commands: [], badges: []}))}}).entries;
const counts: Record<string, number> = {};
const owner = {locale: 'zh' as const, actionAvailable: true, refreshRevision: 0, onAction: () => {}, readData: async (entry: any) => {
  counts[entry.view.viewType] = (counts[entry.view.viewType] ?? 0) + 1;
  if (entry.view.viewType === 'channel_access') return {schema_version: 'opl-app-channel-access.v1', status: 'available', channel_id: 'weixin', connection: {state: 'disconnected'}, actions: [], pending_pairings: [], authorized_users: []};
  return {schema_version: 'opl-app-service-status.v1', status: 'available', service_id: 'example', service: {state: 'ready'}, summary: {status: 'ready'}};
}};
const bridge = {listMcpApps: async () => ({apps: [{miniAppId: 'shared', server: 'fixture', tool: 'open', title: 'OPL Apps', description: '统一工作台中的邮件、审阅与制作入口', resourceUri: 'ui://opl/apps.html', inputSchema: {}, readOnly: true, readiness: 'ready' as const}]}),
  openMcpApp: async () => {throw new Error('This fixture validates navigation; owner reads and actions use the stdio acceptance suite.');},
  callMcpAppTool: async () => ({}), readMcpAppResource: async () => ({}), closeMcpApp: async () => ({closed: true})};
let surface: any;
let WorkspacePage: React.ComponentType = () => null;
installWorkspaceClientPlugin({register(options: any, component: any) {if(options.name === 'main') WorkspacePage = component; return () => {};}} as any, () => surface);
function Fixture() {
  const [page, setPage] = useState('capabilities');
  Object.assign(window, {functionalReadCounts: counts, setFunctionalPage: setPage});
  surface = {locale: 'zh', currentThreadId: 'fixture-thread', openPrimaryView: () => setPage('capabilities'), mcpApps: {bridge, onContext: () => {}, onMessage: () => {}, ...(page === 'task' ? {task: {itemId: 'fixture-task', viewId: 'review'}} : {})}};
  const context: any = {resourceFocus: {section: 'remote'}, settings: {locale: 'zh'}, zh: true, locale: 'zh-CN', projection: null, runtime: null, actionBusyKey: null, onAction: () => {}, navigate: () => {},
    onOpenSoftwareCenter: () => {}, onOpenAppWorkspace: () => setPage('workspace'),
    model: {managedCompanions: [], packageLifecycle: []}, capabilityCatalog: {skills: [], plugins: [], apps: [], errors: []},
    renderSettingsContributions: (destination: any) => {const selected = settingsEntriesForDestination(entries, destination); return selected.length ? <>{selected.map(entry => <ProjectedContribution key={entry.contributionKey} entry={entry} owner={owner}/>)}</> : null;}};
  return <><style>{codexWorkbenchStyles}{'body{margin:0;overflow:auto}#root{height:auto;min-height:100vh}.functional-fixture{max-width:960px;margin:auto;padding:24px}nav{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}'}</style>
    <main className="functional-fixture"><p>功能入口验收环境</p><nav aria-label="验收页面">{[['resources','连接设置'],['services','服务状态'],['capabilities','能力配置']].map(([id,title]) => <button className="settings-action-button" key={id} type="button" aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}>{title}</button>)}</nav>
    <h1>{page==='resources'?'消息与远程连接':page==='services'?'服务状态':page==='capabilities'?'能力配置':'应用工作台'}</h1>
    {page==='resources'?<ResourcesSettingsPage {...context}/>:page==='services'?<ServicesSettingsPage {...context}/>:page==='capabilities'?<CapabilitiesSettingsPage {...context}/>:<McpAppsClientContext.Provider value={{Workspace: McpAppWorkspace, TaskWorkbench: McpTaskWorkbench}}><WorkspacePage/></McpAppsClientContext.Provider>}
    </main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
