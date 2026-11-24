import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";

const PREFERENCES_FILE = "opl-plugin-preferences.json";
const ACTIVITY_FILE = "opl-plugin-activity.json";
const MAX_ACTIVITY_RECORDS = 50;

/**
 * Closed catalog metadata for DSH Cordis plugins and external DSH extensions.
 * Core host services stay under Runtime Components (auto-maintained, non-toggleable);
 * optional product capabilities appear in the unified catalog for user control.
 */
export const DSH_PLUGIN_DESCRIPTORS = Object.freeze([
  {
    pluginId: "opl-team-bots",
    packageName: "@gaofeng21cn/opl-team-bots",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "efficiency",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    settingsDestination: "capabilities",
    labelI18n: { zh: "智能体协作", en: "Agent Collaboration" },
    descriptionI18n: {
      zh: "提供多智能体协同对话与任务协作工作台。",
      en: "Multi-agent collaborative conversations and shared task workbench."
    },
    permissionsI18n: {
      zh: ["复用当前 Codex 会话与线程", "向侧边栏与设置「扩展与能力」注册独立卡片"],
      en: ["Reuses active Codex conversations and threads", "Registers sidebar and Capabilities settings slots"]
    }
  },
  {
    pluginId: "opl-superagent",
    packageName: "@gaofeng21cn/opl-superagent",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "agent",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    settingsDestination: "capabilities",
    labelI18n: { zh: "Superagent 自治工作流", en: "Superagent Workflows" },
    descriptionI18n: {
      zh: "运行由 Codex 驱动的长时自治研究与工程工作流。",
      en: "Long-running autonomous research and engineering workflows powered by Codex."
    },
    permissionsI18n: {
      zh: ["读写选定工作区目录中的项目文件", "运行本地自治任务编排 Web 服务"],
      en: ["Reads and writes files in the selected workspace", "Runs local autonomous orchestration web service"]
    }
  },
  {
    pluginId: "opl-mcp-apps",
    packageName: "@gaofeng21cn/opl-mcp-apps",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "application",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    settingsDestination: "resources",
    labelI18n: { zh: "MCP 应用宿主", en: "MCP App Host" },
    descriptionI18n: {
      zh: "在沙箱交互界面中运行已安装软件提供的领域应用与审阅看板。",
      en: "Runs domain mini-apps and review boards inside sandboxed interactive frames."
    },
    permissionsI18n: {
      zh: ["在沙箱 iframe 中渲染领域界面并同步主题/字号", "复用当前线程的 Codex 工具授权流"],
      en: ["Renders domain UI inside sandboxed iframe with theme sync", "Shares active thread tool authorization approvals"]
    }
  },
  {
    pluginId: "opl-materials-space",
    packageName: "@gaofeng21cn/opl-materials-space",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "application",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "素材空间", en: "Materials Space" },
    descriptionI18n: {
      zh: "按项目工作区浏览与预览标准智能体产出的 deliverables 与文件。",
      en: "Browse and preview user-facing deliverables across registered project workspaces."
    },
    permissionsI18n: {
      zh: ["只读扫描与预览已注册项目工作区产物", "向左侧导航注入独立「素材空间」工作区视图"],
      en: ["Reads registered project workspace deliverables", "Registers the dedicated Materials Space navigation view"]
    }
  },
  {
    pluginId: "opl-runtime-status",
    packageName: "@gaofeng21cn/opl-runtime-status",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "efficiency",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "运行概览", en: "Runtime Overview" },
    descriptionI18n: {
      zh: "实时监控工作流阶段进展、项目活动与任务工作台。",
      en: "Monitors workflow stage progression, active projects, and task workbenches."
    },
    permissionsI18n: {
      zh: ["读取运行态工作项与服务恢复快照", "向左侧导航注入「运行状态」概览面板"],
      en: ["Reads work-item runtime and service recovery snapshots", "Registers the Runtime Overview navigation panel"]
    }
  },
  {
    pluginId: "billion-context",
    packageName: "billion-context",
    tier: "external_plugin",
    origin: "external",
    intentCategory: "efficiency",
    canToggle: true,
    canInstall: true,
    canUninstall: true,
    settingsDestination: "models",
    upstreamUrl: "https://github.com/ranxianglei/billion-context",
    labelI18n: { zh: "Billion Context", en: "Billion Context" },
    descriptionI18n: {
      zh: "通过本机代理压缩 Codex 长对话上下文。",
      en: "Compress long Codex conversations through a local proxy."
    },
    permissionsI18n: {
      zh: ["作为本机 Codex 启动包装代理运行", "从 npm 安装且全程禁用生命周期脚本"],
      en: ["Runs as a local Codex launch wrapper proxy", "Installed from npm with lifecycle scripts disabled"]
    }
  },
  {
    pluginId: "opl-host-core",
    packageName: "@gaofeng21cn/opl-host-core",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "OPL 宿主核心服务", en: "OPL Host Core" },
    descriptionI18n: {
      zh: "负责状态聚合、原生更新协调与桌面/Web 服务路由。",
      en: "Coordinates state aggregation, updates, and desktop/web transport."
    },
    permissionsI18n: {
      zh: ["必需运行时核心，随 OPL 自动维护"],
      en: ["Required core runtime maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-codex-native",
    packageName: "@gaofeng21cn/opl-codex-native",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "Codex 原生执行桥", en: "Codex Native Bridge" },
    descriptionI18n: {
      zh: "连接本机 Codex App Server 与模型、会话及 MCP 通道。",
      en: "Connects local Codex App Server for models, threads, and MCP tools."
    },
    permissionsI18n: {
      zh: ["必需运行时核心，随 OPL 自动维护"],
      en: ["Required core runtime maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-framework-bridge",
    packageName: "@gaofeng21cn/opl-framework-bridge",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "Framework 契约桥", en: "Framework Bridge" },
    descriptionI18n: {
      zh: "对接 OPL Framework CLI 状态读取与操作执行。",
      en: "Interfaces with OPL Framework CLI state reads and action execution."
    },
    permissionsI18n: {
      zh: ["必需运行时核心，随 OPL 自动维护"],
      en: ["Required core runtime maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-studio-client",
    packageName: "@gaofeng21cn/opl-studio-client",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "Studio 客户端工作台", en: "Studio Client Workbench" },
    descriptionI18n: {
      zh: "渲染对话工作台、软件中心与统一设置界面。",
      en: "Renders the conversation workbench, Software Center, and unified settings."
    },
    permissionsI18n: {
      zh: ["必需前端核心模块，随 OPL 自动维护"],
      en: ["Required client workbench module maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-dsh-tool-mcp",
    packageName: "@gaofeng21cn/opl-dsh-tool-mcp",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "DSH 工具代理 MCP", en: "DSH Tool MCP" },
    descriptionI18n: {
      zh: "向 Codex 暴露授权后的 DSH 与领域工作区工具。",
      en: "Exposes authorized DSH and workspace tools to Codex."
    },
    permissionsI18n: {
      zh: ["必需工具协议核心，随 OPL 自动维护"],
      en: ["Required tool protocol core maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-web-routes",
    packageName: "@gaofeng21cn/opl-web-routes",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "WebUI 路由扩展", en: "WebUI Route Extension" },
    descriptionI18n: {
      zh: "为独立 Web/Docker 模式提供认证、SSE 与宿主 HTTP API。",
      en: "Serves authenticated HTTP APIs and SSE events in Web/Docker mode."
    },
    permissionsI18n: {
      zh: ["必需接口路由模块，随 OPL 自动维护"],
      en: ["Required HTTP route module maintained automatically by OPL"]
    }
  },
  {
    pluginId: "opl-codex-agents",
    packageName: "@gaofeng21cn/opl-codex-agents",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "runtime",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "Codex 工作台托管基座", en: "Codex Workbench Runtime" },
    descriptionI18n: {
      zh: "为自治/协作子工作台提供统一的 Codex 进程与认证托管。",
      en: "Hosts shared Codex child-workbench lifecycle and auth bridging."
    },
    permissionsI18n: {
      zh: ["必需运行时共享包，随 OPL 自动维护"],
      en: ["Required runtime library maintained automatically by OPL"]
    }
  }
]);

const DESCRIPTOR_BY_ID = new Map(DSH_PLUGIN_DESCRIPTORS.map(item => [item.pluginId, item]));
const DESCRIPTOR_BY_PKG = new Map(DSH_PLUGIN_DESCRIPTORS.map(item => [item.packageName, item]));

export function findDshPluginDescriptor(idOrPackageName) {
  if (typeof idOrPackageName !== "string") return undefined;
  return DESCRIPTOR_BY_ID.get(idOrPackageName) ?? DESCRIPTOR_BY_PKG.get(idOrPackageName);
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

/**
 * Reads the persisted list of disabled optional product plugin IDs from profile preferences.
 * Never admits core_runtime or unknown IDs so core platform services always boot.
 */
export function readDisabledOptionalPluginIds(profileDir) {
  if (!profileDir) return [];
  const data = readJsonSafe(path.join(profileDir, PREFERENCES_FILE));
  if (!data || !Array.isArray(data.disabledPlugins)) return [];
  return [...new Set(data.disabledPlugins.filter(id => {
    const descriptor = DESCRIPTOR_BY_ID.get(id);
    return descriptor?.tier === "optional_product";
  }))];
}

/**
 * Converts disabled optional product plugin IDs into native DSH cordis.yml PatchOptions entries.
 */
export function readDisabledPluginPatches(profileDir) {
  return readDisabledOptionalPluginIds(profileDir).map(id => ({ id, disabled: true }));
}

export async function setOptionalPluginEnabled(profileDir, pluginId, enabled) {
  const descriptor = DESCRIPTOR_BY_ID.get(pluginId);
  if (!descriptor || descriptor.tier !== "optional_product") {
    throw new Error(`Optional DSH plugin expected, received: ${String(pluginId)}`);
  }
  if (!profileDir) {
    throw new Error("DSH profile directory is unavailable");
  }
  const filePath = path.join(profileDir, PREFERENCES_FILE);
  await withFileLock(filePath, async () => {
    const current = new Set(readDisabledOptionalPluginIds(profileDir));
    if (enabled) current.delete(pluginId);
    else current.add(pluginId);
    writeJsonAtomic(filePath, {
      schema: "opl_dsh_plugin_preferences.v1",
      updatedAt: new Date().toISOString(),
      disabledPlugins: [...current].sort()
    });
  }, { waitMs: 10000 });
  return { pluginId, enabled };
}

export function readDshPluginActivity(profileDir) {
  if (!profileDir) return [];
  const data = readJsonSafe(path.join(profileDir, ACTIVITY_FILE));
  if (!data || !Array.isArray(data.records)) return [];
  return data.records.slice(0, MAX_ACTIVITY_RECORDS);
}

export async function appendDshPluginActivity(profileDir, entry) {
  if (!profileDir || !entry || typeof entry !== "object") return [];
  const filePath = path.join(profileDir, ACTIVITY_FILE);
  return withFileLock(filePath, async () => {
    const existing = readDshPluginActivity(profileDir);
    const descriptor = findDshPluginDescriptor(entry.pluginId || entry.packageName);
    const record = {
      id: entry.id || `${entry.pluginId || entry.packageName || "plugin"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      pluginId: descriptor?.pluginId ?? entry.pluginId ?? entry.packageName,
      packageName: descriptor?.packageName ?? entry.packageName ?? entry.pluginId,
      labelI18n: descriptor?.labelI18n ?? entry.labelI18n ?? { zh: String(entry.pluginId || entry.packageName), en: String(entry.pluginId || entry.packageName) },
      action: entry.action,
      status: entry.status,
      startedAt: entry.startedAt ?? new Date().toISOString(),
      finishedAt: entry.finishedAt ?? new Date().toISOString(),
      ...(entry.targetVersion ? { targetVersion: entry.targetVersion } : {}),
      ...(entry.restartRequired === true ? { restartRequired: true } : {}),
      ...(entry.detail ? { detail: String(entry.detail) } : {})
    };
    const next = [record, ...existing].slice(0, MAX_ACTIVITY_RECORDS);
    writeJsonAtomic(filePath, {
      schema: "opl_dsh_plugin_activity.v1",
      updatedAt: new Date().toISOString(),
      records: next
    });
    return next;
  }, { waitMs: 10000 });
}

function readInstalledBundledVersion(packageName, { dshProfileDir, dshInstallAnchor }) {
  if (dshProfileDir) {
    try {
      const profileRequire = createRequire(path.join(dshProfileDir, "package.json"));
      const manifest = readJsonSafe(profileRequire.resolve(`${packageName}/package.json`));
      if (manifest?.version) return { version: manifest.version, overridden: true };
    } catch {
      // Fall back to bundled carrier version.
    }
  }
  if (dshInstallAnchor) {
    try {
      const carrierRequire = createRequire(dshInstallAnchor);
      const manifest = readJsonSafe(carrierRequire.resolve(`${packageName}/package.json`));
      if (manifest?.version) return { version: manifest.version, overridden: false };
    } catch {
      // Try reading directly from plugins/ in workspace checkouts where exports omit package.json
      const rootDir = path.dirname(dshInstallAnchor);
      const shortName = packageName.replace(/^@gaofeng21cn\//, "");
      const localManifest = readJsonSafe(path.join(rootDir, "plugins", shortName, "package.json"));
      if (localManifest?.version) return { version: localManifest.version, overridden: false };
    }
  }
  return { version: null, overridden: false };
}

/**
 * Builds the unified DSH plugin catalog combining core runtime components,
 * toggleable first-party DSH product plugins, external npm/DSH plugins, and activity log.
 */
export function buildDshPluginCatalog({
  dshProfileDir,
  dshInstallAnchor,
  disabledAtBoot = [],
  billionContext,
  updateProjection
} = {}) {
  const disabledSet = new Set(readDisabledOptionalPluginIds(dshProfileDir));
  const bootDisabledSet = new Set(Array.isArray(disabledAtBoot) ? disabledAtBoot : []);
  const updatesMap = updateProjection?.plugins ?? {};
  const activity = readDshPluginActivity(dshProfileDir);

  let restartRequired = false;
  const entries = DSH_PLUGIN_DESCRIPTORS.map(descriptor => {
    if (descriptor.pluginId === "billion-context") {
      const bc = billionContext ?? {
        enabled: false,
        installed: false,
        version: null,
        availableVersion: null,
        updateAvailable: false,
        activeVersion: null,
        active: false,
        startupFailed: false,
        pendingOperation: null,
        pendingVersion: null
      };
      const pendingRestart = Boolean(bc.pendingOperation) || bc.active !== bc.enabled;
      if (pendingRestart) restartRequired = true;
      return {
        ...descriptor,
        installed: Boolean(bc.installed),
        enabled: Boolean(bc.enabled),
        active: Boolean(bc.active),
        version: bc.version ?? null,
        activeVersion: bc.activeVersion ?? null,
        availableVersion: bc.availableVersion ?? null,
        updateAvailable: Boolean(bc.updateAvailable),
        startupFailed: Boolean(bc.startupFailed),
        pendingRestart,
        pendingOperation: bc.pendingOperation ?? null,
        pendingVersion: bc.pendingVersion ?? null
      };
    }

    const { version, overridden } = readInstalledBundledVersion(descriptor.packageName, { dshProfileDir, dshInstallAnchor });
    const updateInfo = updatesMap[descriptor.packageName];
    const updateAvailable = updateInfo?.state === "update_available";
    const enabled = descriptor.tier === "optional_product" ? !disabledSet.has(descriptor.pluginId) : true;
    const active = descriptor.tier === "optional_product" ? !bootDisabledSet.has(descriptor.pluginId) : true;
    const pendingRestart = (descriptor.tier === "optional_product" && enabled !== active)
      || (overridden && updateInfo?.installed !== version);
    if (pendingRestart) restartRequired = true;
    return {
      ...descriptor,
      installed: Boolean(version),
      enabled,
      active,
      version: updateInfo?.installed ?? version,
      activeVersion: active ? version : null,
      availableVersion: updateInfo?.available ?? null,
      updateAvailable,
      startupFailed: false,
      pendingRestart,
      pendingOperation: null,
      pendingVersion: null,
      ...(updateInfo?.state === "unavailable" && updateInfo?.reason ? { checkErrorReason: updateInfo.reason } : {})
    };
  });

  if (updateProjection?.profileBootRecovery) {
    restartRequired = false;
  }

  return {
    schema: "opl_dsh_plugin_catalog.v1",
    checkedAt: updateProjection?.checkedAt ?? new Date().toISOString(),
    entries,
    activity,
    restartRequired,
    profileBootRecovery: updateProjection?.profileBootRecovery ?? null
  };
}
