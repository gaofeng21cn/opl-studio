import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";
import { listDshSourcePackages } from "./src/dsh-source-packages.mjs";

const PREFERENCES_FILE = "opl-plugin-preferences.json";
const ACTIVITY_FILE = "opl-plugin-activity.json";
const USER_EXTERNAL_PLUGINS_FILE = "opl-external-dsh-plugins.json";
const MAX_ACTIVITY_RECORDS = 50;
const NPM_PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

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
    intentCategory: "extension",
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
    intentCategory: "extension",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    settingsDestination: "capabilities",
    labelI18n: { zh: "Superagent 工单台", en: "Superagent Tickets" },
    descriptionI18n: {
      zh: "面向外部 GitHub / 飞书来单的无人值守工单台与自治工作流。",
      en: "Unattended external ticket intake and autonomous Codex engineering workflows."
    },
    permissionsI18n: {
      zh: ["读写选定工作区目录中的项目文件", "运行本地自治任务编排 Web 服务"],
      en: ["Reads and writes files in the selected workspace", "Runs local autonomous orchestration web service"]
    }
  },
  {
    pluginId: "opl-mcp-apps",
    packageName: "@gaofeng21cn/opl-mcp-apps",
    tier: "core_runtime",
    origin: "opl",
    intentCategory: "dependency",
    canToggle: false,
    canInstall: false,
    canUninstall: false,
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
    intentCategory: "extension",
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
    intentCategory: "extension",
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
    pluginId: "opl-flow-workbench",
    packageName: "@gaofeng21cn/opl-flow-workbench",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "extension",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    labelI18n: { zh: "OPL Flow 总控", en: "OPL Flow Control Tower" },
    descriptionI18n: {
      zh: "个人跨 Codex / AntiGravity / OPL DSH 与多机器 Beads/Dolt 长期目标总账与自动路由控制塔（仅在已启用 opl-flow Package 时条件挂载）。",
      en: "Cross-carrier personal Beads/Dolt objective ledger and zero-token auto-router control tower (conditionally mounted when opl-flow is enabled)."
    },
    permissionsI18n: {
      zh: ["通过 Framework 公开 RPC 读取 opl-flow 决策看板并执行审批/投递/路由控制", "按 jump_mode 切换或拉起宿主原生会话，不自建第二套聊天框"],
      en: ["Reads opl-flow decision dashboard and executes actions via Framework RPC", "Switches to or launches native host threads per jump_mode"]
    }
  },
  {
    pluginId: "opl-channel-weixin",
    packageName: "@gaofeng21cn/opl-channel-weixin",
    tier: "optional_product",
    origin: "opl",
    intentCategory: "channel",
    canToggle: true,
    canInstall: false,
    canUninstall: false,
    settingsDestination: "resources",
    labelI18n: { zh: "微信远程", en: "Weixin Remote" },
    descriptionI18n: {
      zh: "通过微信连接当前 OPL App 会话。",
      en: "Connect Weixin to the current OPL App conversation."
    },
    permissionsI18n: {
      zh: ["经扫码授权后收发微信消息", "将微信会话绑定到当前设备的 Codex 线程"],
      en: ["Send and receive Weixin messages after QR authorization", "Bind Weixin conversations to this device’s Codex threads"]
    }
  },
  {
    pluginId: "billion-context",
    packageName: "billion-context",
    tier: "external_plugin",
    origin: "external",
    intentCategory: "extension",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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
    intentCategory: "dependency",
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

/**
 * Validates and normalizes an external npm DSH plugin package name.
 * Rejects reserved first-party scopes, descriptor collisions, URLs, traversal, and flags.
 */
export function validateExternalDshPackageName(rawName) {
  if (typeof rawName !== "string") {
    throw Object.assign(new Error("External DSH plugin package name must be a non-empty string"), { code: "invalid_package_name" });
  }
  const normalized = rawName.trim();
  if (!normalized || normalized.length > 214 || !NPM_PACKAGE_NAME_RE.test(normalized) || normalized.includes("..")) {
    throw Object.assign(new Error(`Invalid npm package name: ${String(rawName)}`), { code: "invalid_package_name" });
  }
  if (normalized.startsWith("@gaofeng21cn/") || normalized.startsWith("@one-person-lab/")) {
    throw Object.assign(new Error(`First-party scoped package cannot be managed as an external npm plugin: ${normalized}`), { code: "invalid_package_name" });
  }
  if (findDshPluginDescriptor(normalized)) {
    throw Object.assign(new Error(`Package is already managed in the built-in catalog: ${normalized}`), { code: "invalid_package_name" });
  }
  return normalized;
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

/**
 * Reads user-installed community/external npm DSH plugin metadata from profile storage.
 */
export function readUserExternalDshPlugins(profileDir) {
  if (!profileDir) return {};
  const data = readJsonSafe(path.join(profileDir, USER_EXTERNAL_PLUGINS_FILE));
  if (!data || data.schema !== "opl_user_external_dsh_plugins.v1" || !data.plugins || typeof data.plugins !== "object") {
    return {};
  }
  const clean = {};
  for (const [key, entry] of Object.entries(data.plugins)) {
    if (!entry || typeof entry !== "object") continue;
    try {
      const packageName = validateExternalDshPackageName(entry.packageName ?? key);
      clean[packageName] = { ...entry, pluginId: packageName, packageName };
    } catch {
      // Ignore tampered or reserved package names.
    }
  }
  return clean;
}

export async function upsertUserExternalDshPlugin(profileDir, record) {
  if (!profileDir) throw new Error("DSH profile directory is unavailable");
  const packageName = validateExternalDshPackageName(record?.packageName ?? record?.pluginId);
  const filePath = path.join(profileDir, USER_EXTERNAL_PLUGINS_FILE);
  return withFileLock(filePath, async () => {
    const plugins = readUserExternalDshPlugins(profileDir);
    plugins[packageName] = {
      ...plugins[packageName],
      ...record,
      pluginId: packageName,
      packageName,
      updatedAt: new Date().toISOString()
    };
    writeJsonAtomic(filePath, {
      schema: "opl_user_external_dsh_plugins.v1",
      updatedAt: new Date().toISOString(),
      plugins
    });
    return plugins[packageName];
  }, { waitMs: 10000 });
}

export async function removeUserExternalDshPlugin(profileDir, rawPackageName) {
  if (!profileDir) return {};
  const packageName = validateExternalDshPackageName(rawPackageName);
  const filePath = path.join(profileDir, USER_EXTERNAL_PLUGINS_FILE);
  return withFileLock(filePath, async () => {
    const plugins = readUserExternalDshPlugins(profileDir);
    delete plugins[packageName];
    writeJsonAtomic(filePath, {
      schema: "opl_user_external_dsh_plugins.v1",
      updatedAt: new Date().toISOString(),
      plugins
    });
    return plugins;
  }, { waitMs: 10000 });
}

export function readInstalledExternalPackageManifest(profileDir, packageName) {
  if (!profileDir || !packageName) return null;
  return readJsonSafe(path.join(profileDir, "node_modules", ...packageName.split("/"), "package.json"));
}

/** Reconciles staged external plugin updates/removals during cold boot before DSH loads the profile. */
export function reconcileUserExternalPluginsOnBoot(profileDir) {
  if (!profileDir) return;
  const records = readUserExternalDshPlugins(profileDir);
  let changed = false;
  const next = { ...records };
  for (const [pkg, record] of Object.entries(records)) {
    if (record.pendingOperation === "remove") {
      // Detach the bundle before deleting package files. Leave the removal pending
      // when cleanup fails so a later boot can retry with the same profile state.
      const manifestPath = path.join(profileDir, "package.json");
      const manifest = readJsonSafe(manifestPath);
      try {
        const bundles = manifest?.dsh?.profile?.bundles;
        if (Array.isArray(bundles) && bundles.includes(pkg)) {
          manifest.dsh.profile.bundles = bundles.filter(name => name !== pkg);
          writeJsonAtomic(manifestPath, manifest);
        }
        fs.rmSync(path.join(profileDir, "node_modules", ...pkg.split("/")), { recursive: true, force: true });
        if (manifest?.dependencies && Object.hasOwn(manifest.dependencies, pkg)) {
          delete manifest.dependencies[pkg];
          writeJsonAtomic(manifestPath, manifest);
        }
      } catch (error) {
        console.warn("[OPL:dsh-plugin-reconcile]", JSON.stringify({
          packageName: pkg,
          operation: "remove_cleanup",
          code: error?.code ?? null,
          message: error instanceof Error ? error.message : String(error)
        }));
        continue;
      }
      delete next[pkg];
      changed = true;
      continue;
    }
    const installedManifest = readInstalledExternalPackageManifest(profileDir, pkg);
    if (!installedManifest) {
      delete next[pkg];
      changed = true;
      continue;
    }
    if (record.pendingOperation) {
      next[pkg] = {
        ...record,
        installedVersion: installedManifest.version ?? record.installedVersion ?? null,
        pendingOperation: null,
        pendingVersion: null,
        updateAvailable: false
      };
      changed = true;
    }
  }
  if (!changed) return;
  writeJsonAtomic(path.join(profileDir, USER_EXTERNAL_PLUGINS_FILE), {
    schema: "opl_user_external_dsh_plugins.v1",
    updatedAt: new Date().toISOString(),
    plugins: next
  });
}

/**
 * Converts a BillionContextPreference snapshot into a generic external plugin catalog entry.
 */
export function externalPluginEntryFromBillionContext(billionContext) {
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
  return {
    pluginId: "billion-context",
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
    pendingVersion: bc.pendingVersion ?? null,
    requiresRestartOnMutate: Boolean(bc.installed && (bc.active || bc.pendingOperation)),
    sourceLabel: "npm · ranxianglei/billion-context"
  };
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
      const localManifest = listDshSourcePackages(rootDir).find(entry => entry.id === shortName)?.manifest;
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
  activeExternalPlugins = [],
  activeExternalPluginVersions = {},
  nativeWeixin = false,
  externalEntries,
  billionContext,
  updateProjection
} = {}) {
  const disabledSet = new Set(readDisabledOptionalPluginIds(dshProfileDir));
  const bootDisabledSet = new Set(Array.isArray(disabledAtBoot) ? disabledAtBoot : []);
  const bootActiveExternalSet = new Set(Array.isArray(activeExternalPlugins) ? activeExternalPlugins : []);
  const updatesMap = updateProjection?.plugins ?? {};
  const activity = readDshPluginActivity(dshProfileDir);

  const resolvedExternalEntries = Array.isArray(externalEntries)
    ? externalEntries
    : [externalPluginEntryFromBillionContext(billionContext)];
  const externalMap = new Map(resolvedExternalEntries.map(entry => [entry.pluginId, entry]));

  let restartRequired = false;
  const descriptors = nativeWeixin ? DSH_PLUGIN_DESCRIPTORS
    : DSH_PLUGIN_DESCRIPTORS.filter(descriptor => descriptor.pluginId !== "opl-channel-weixin");
  const entries = descriptors.map(descriptor => {
    const adapterEntry = externalMap.get(descriptor.pluginId);
    if (descriptor.tier === "external_plugin") {
      const state = adapterEntry ?? externalPluginEntryFromBillionContext(undefined);
      if (state.pendingRestart) restartRequired = true;
      return {
        ...descriptor,
        installed: Boolean(state.installed),
        enabled: Boolean(state.enabled),
        active: Boolean(state.active),
        version: state.version ?? null,
        activeVersion: state.activeVersion ?? null,
        availableVersion: state.availableVersion ?? null,
        updateAvailable: Boolean(state.updateAvailable),
        startupFailed: Boolean(state.startupFailed),
        pendingRestart: Boolean(state.pendingRestart),
        pendingOperation: state.pendingOperation ?? null,
        pendingVersion: state.pendingVersion ?? null,
        requiresRestartOnMutate: state.requiresRestartOnMutate ?? Boolean(state.installed && (state.active || state.pendingOperation)),
        canCancelPending: Boolean(state.pendingOperation),
        ...(state.sourceLabel ? { sourceLabel: state.sourceLabel } : {}),
        ...(state.checkErrorReason ? { checkErrorReason: state.checkErrorReason } : {})
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
      sourceLabel: "OPL",
      ...(updateInfo?.state === "unavailable" && updateInfo?.reason ? { checkErrorReason: updateInfo.reason } : {})
    };
  });

  // Merge community/external DSH plugins installed into this profile dynamically.
  const userExternal = readUserExternalDshPlugins(dshProfileDir);
  for (const record of Object.values(userExternal)) {
    if (DESCRIPTOR_BY_ID.has(record.pluginId) || DESCRIPTOR_BY_PKG.has(record.packageName)) continue;
    const profileVersion = readInstalledExternalPackageManifest(dshProfileDir, record.packageName)?.version;
    const installedVersion = profileVersion ?? record.installedVersion ?? null;
    const installed = Boolean(profileVersion) || record.pendingOperation === "remove";
    const active = bootActiveExternalSet.has(record.packageName);
    const enabled = record.enabled !== false;
    const pendingOperation = record.pendingOperation ?? null;
    const pendingVersion = record.pendingVersion ?? null;
    const pendingRestart = Boolean(pendingOperation) || enabled !== active || Boolean(installed && !active && enabled);
    const canCancelPending = pendingOperation === "remove" && Boolean(profileVersion);
    if (pendingRestart) restartRequired = true;
    entries.push({
      pluginId: record.pluginId,
      packageName: record.packageName,
      tier: "external_plugin",
      origin: "external",
      intentCategory: record.intentCategory ?? "extension",
      canToggle: true,
      canInstall: true,
      canUninstall: true,
      ...(record.upstreamUrl ? { upstreamUrl: record.upstreamUrl } : {}),
      labelI18n: record.labelI18n ?? { zh: record.packageName, en: record.packageName },
      descriptionI18n: record.descriptionI18n ?? {
        zh: "由用户通过 npm 安装的第三方 DSH 插件。",
        en: "Third-party DSH plugin installed from npm."
      },
      permissionsI18n: record.permissionsI18n ?? {
        zh: ["作为 DSH 插件扩展运行，变更需重启应用生效", "从 npm 安装且全程禁用生命周期脚本"],
        en: ["Runs as a DSH profile plugin (changes apply after restart)", "Installed from npm with lifecycle scripts disabled"]
      },
      installed,
      enabled,
      active,
      version: installedVersion,
      activeVersion: active ? (activeExternalPluginVersions[record.packageName] ?? null) : null,
      availableVersion: record.availableVersion ?? null,
      updateAvailable: Boolean(record.updateAvailable),
      startupFailed: false,
      pendingRestart,
      pendingOperation,
      pendingVersion,
      requiresRestartOnMutate: true,
      canCancelPending,
      sourceLabel: "npm",
      ...(record.checkErrorReason ? { checkErrorReason: record.checkErrorReason } : {})
    });
  }

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
