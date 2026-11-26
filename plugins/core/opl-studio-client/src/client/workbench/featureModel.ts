import type { WorkbenchActionRef, WorkbenchFeatureRef } from './workbenchModel';

// Renderer navigation and source pointers only. No business state is persisted here.
const settings = 'settings_control_center.app_settings_read_model';
const runtime = 'operator.workbench.work_item_projection_v2';
export const featureCatalog = [
  ['B0-01', '桌面工作台', 'Desktop workbench', 'overview', 'studio', 'Studio/carrier'],
  ['B0-02', '任务与历史', 'Tasks and history', 'workspace', 'codex', 'thread/list, thread/read'],
  ['B0-03', '对话执行', 'Conversation', 'workspace', 'codex', 'turn/start, turn/steer, turn/interrupt'],
  ['B0-04', '输入与附件', 'Composer and attachments', 'workspace', 'codex', 'workspace bridge / turn/start'],
  ['B0-05', '权限与审批', 'Permissions and approvals', 'workspace', 'codex', 'server requests / permission profiles'],
  ['B0-06', '工作区文件', 'Workspace files', 'workspace', 'codex', 'canonical thread workspace'],
  ['B0-07', '结果与预览', 'Results and previews', 'workspace', 'codex', 'canonical thread workspace / owner result refs'],
  ['B0-08', 'Git', 'Git', 'workspace', 'codex', 'canonical thread workspace / Git'],
  ['B0-09', '工具与环境', 'Tools and environment', 'workspace', 'codex', 'turn tool/process events'],
  ['B0-10', '项目与工作区', 'Projects and workspaces', 'workspace', 'codex', 'thread/start.cwd / thread/read.cwd'],
  ['B0-11', '子 Agent', 'Subagents', 'workspace', 'codex', 'collabAgentToolCall / thread/read'],
  ['B0-12', '计划任务与后台', 'Scheduled tasks and background', 'services', 'framework', 'provider.temporal.details.scheduler'],
  ['B0-13', '记忆与个性化', 'Memory and personalization', 'instructions', 'framework', "codex_personalization"],
  ['B0-14', '设置与无障碍', 'Settings and accessibility', 'preferences', 'studio', 'Studio/preferences'],
  ['R1-01', 'Gateway 账户', 'Gateway account', 'account', 'framework', `${settings}.opl_gateway_account`],
  ['R1-02', '模型与用量', 'Models and usage', 'models', 'framework', `${settings}.opl_gateway_account`],
  ['R1-03', '首次启动', 'First run', 'overview', 'studio', 'readInitialize / chat-first'],
  ['R1-04', 'Agents 与能力', 'Agents and capabilities', 'agents', 'framework', 'agent_packages'],
  ['R1-05', '控制中心', 'Control center', 'overview', 'framework', settings],
  ['R1-06', '版本与支持', 'Version and support', 'about', 'studio', 'carrier diagnostics / native updater'],
  ['U1-01', 'Package 目录与入口', 'Package directory and entries', 'agents', 'framework', 'agent_packages'],
  ['U1-02', 'Agent 上下文', 'Active Agent context', 'agents', 'framework', 'agent_packages'],
  ['U1-03', '运行与结果', 'Runtime and results', 'services', 'framework', runtime],
  ['U1-04', 'App / Base / Packages 更新', 'App / Base / Packages lifecycle', 'updates', 'framework', 'managed_update'],
  ['U1-05', 'WebUI 同语义', 'WebUI parity', 'about', 'studio', 'shared renderer / carrier capabilities'],
  ['U1-06', '数据与安全清理', 'Data and cleanup', 'storage', 'framework', `${settings}.storage_lifecycle`],
  ['U1-07', '动态 Runtime 与视图', 'Dynamic runtime and views', 'capabilities', 'framework', 'ui_contributions'],
] as const;

export type FeatureDestination = typeof featureCatalog[number][3];
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export function featureSource(state: unknown, path: string): unknown {
  const root = record(state);
  const outer = record(root?.app_state) ?? root;
  return path.split('.').reduce<unknown>((value, key) => record(value)?.[key], record(outer?.app_state) ?? outer);
}

export function referencedFeatureActions(value: unknown, actions: WorkbenchActionRef[]): WorkbenchActionRef[] {
  const refs = new Set<string>();
  function visit(node: unknown) {
    if (typeof node === 'string') refs.add(node.startsWith('app_state.actions#') ? node.slice('app_state.actions#'.length) : node);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (record(node)) Object.values(node as Record<string, unknown>).forEach(visit);
  }
  visit(value);
  return actions.filter(action => refs.has(action.id));
}

export function deriveFeatureRefs(state: unknown, actions: WorkbenchActionRef[] = []): WorkbenchFeatureRef[] {
  return featureCatalog.map(([featureId, label, labelEn, destination, authority, sourceRef]) => {
    const pluginKey = featureId === 'B0-12' ? 'tasks' : featureId === 'B0-13' ? 'memory' : featureId === 'U1-06' ? 'storage' : undefined;
    const pluginSource = pluginKey ? featureSource(state, `workbench_services.${pluginKey}`) : undefined;
    const source = pluginSource ?? featureSource(state, sourceRef);
    const projection = record(source);
    const freshness = record(projection?.freshness);
    const directory = record(projection?.directory);
    const status = typeof directory?.status === 'string' ? directory.status : typeof projection?.status === 'string' ? projection.status : typeof projection?.availability === 'string' ? projection.availability : undefined;
    const owner = typeof projection?.owner === 'string' ? projection.owner : authority === 'codex' ? 'opl-codex-native' : authority === 'studio' ? 'OPL Studio' : 'OPL Framework';
    const refs = referencedFeatureActions(source, actions);
    const feature: WorkbenchFeatureRef = {
      featureId, label, labelEn, destination, owner, sourceRef: pluginSource ? `workbench_services.${pluginKey}` : sourceRef, actions: refs,
      state: authority === 'studio' ? 'available' : authority === 'codex' ? 'degraded' : ['available', 'ready', 'current', 'connected', 'healthy'].includes(status ?? '') ? 'available' : source !== undefined && source !== null ? 'degraded' : 'owner_action_required',
      summary: authority === 'codex' ? '等待 Codex App Server 状态。' : source === undefined && authority === 'framework' ? 'Owner 尚未投影此功能，不能在此执行。' : '入口已提供；状态以当前 owner 回读为准。',
      nextStep: authority === 'codex' ? '新建或打开任务；连接失败时重试。' : authority === 'studio' ? '打开对应页面。' : '刷新状态；如仍未提供，请在所属 owner 配置此能力。',
      affectsCodex: authority === 'codex',
    };
    if (projection?.stale === true || freshness?.stale === true || ['stale', 'cached', 'partial', 'degraded', 'attention_needed'].includes(status ?? '')) feature.state = 'degraded';
    if (['setup_required', 'reauth_required', 'not_configured', 'missing_configuration'].includes(status ?? '')) feature.state = 'not_configured';
    if (['unavailable', 'error', 'read_error', 'invalid', 'unsupported'].includes(status ?? '')) feature.state = 'unavailable';
    if (typeof projection?.reason === 'string') feature.summary = projection.reason;
    else if (typeof projection?.reason_code === 'string') feature.summary = projection.reason_code;
    if (typeof projection?.next_visible_step === 'string') feature.nextStep = projection.next_visible_step;
    // A running scheduler service alone does not expose task CRUD or history.
    if (featureId === 'B0-12' && !pluginSource && feature.state === 'available') {
      feature.state = 'owner_action_required';
      feature.summary = '后台服务状态已提供，但 owner 未提供计划任务操作。隐藏窗口后当前 turn 继续；退出 App 后不承诺继续。';
    }
    if (featureId === 'B0-13' && !pluginSource && projection && ['available', 'degraded'].includes(feature.state)) {
      feature.state = 'degraded';
      feature.summary = '个性化入口已提供；长期记忆引用需在记忆页面按需读取，空字段不能代表能力缺失。';
    }
    if (pluginSource && Array.isArray(projection?.action_refs)) {
      feature.nextStep = '打开对应页面，读取当前清单并预览操作；执行结果以所属服务回执为准。';
      feature.summary = typeof projection?.reason === 'string' && projection.reason ? projection.reason : '管理接口已提供；具体文件、任务和操作结果需在页面读取。';
    }
    if (pluginSource && feature.state === 'available' && (typeof projection?.read_ref !== 'string' || !Array.isArray(projection?.action_refs) || !projection.action_refs.length)) {
      feature.state = 'owner_action_required';
      feature.summary = '所属服务尚未提供完整读取和操作引用；请升级 Framework 后刷新。';
    }
    if (featureId === 'U1-03' && projection && projection.schema_version !== 'work-item-projection.v2') {
      feature.state = 'unavailable'; feature.summary = 'Runtime 投影格式不受支持；请刷新或在 owner 更新后重试。';
    }
    if (featureId === 'U1-06' && projection && !pluginSource && !refs.length) feature.state = 'owner_action_required';
    return feature;
  });
}

export function featureRefsWithCodexStatus(features: WorkbenchFeatureRef[], status: 'idle' | 'loading' | 'ready' | 'error', error: string, stateStatus: 'loading' | 'ready' | 'error', observations: Partial<Record<string, Pick<WorkbenchFeatureRef, 'state' | 'summary'>>> = {}): WorkbenchFeatureRef[] {
  return features.map(feature => feature.affectsCodex ? {
    ...feature,
    state: status === 'ready' ? (feature.featureId === 'B0-02' ? 'available' : 'degraded') : status === 'error' ? 'unavailable' : 'degraded',
    summary: status === 'ready' ? (feature.featureId === 'B0-02' ? '已读取任务目录。打开任务时仍以 canonical thread 回读为准。' : 'App Server 已连接；此项操作尚需当前任务的文件、权限或执行回读确认，不能由连接状态判定。') : error || '正在连接 Codex App Server，可保留草稿后重试。',
    ...(status === 'ready' ? observations[feature.featureId] : {}),
  } : feature.owner !== 'OPL Studio' && stateStatus !== 'ready' ? {
    ...feature, state: 'degraded', summary: stateStatus === 'error' ? 'Owner 读取失败；当前内容可能是缓存。请刷新重试，普通 Codex 不受影响。' : '正在读取 owner 状态，普通 Codex 不受影响。',
    actions: [],
  } : feature);
}
