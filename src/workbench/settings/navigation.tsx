import type { WorkbenchSettings } from "../settingsModel";

import { SettingsDestinationId } from "./types";
import { NavigationDestination, NavigationGroup } from "./presentation";

export const navigationCopy = {
  zh: {
    groups: {
      overview: "概览",
      account_models: "账户与模型",
      connections_deployment: "连接与部署",
      workspace: "工作区",
      agents_capabilities: "能力与指令",
      runtime_maintenance: "运行与维护",
      preferences: "偏好"
    },
    destinations: {
      overview: "概览",
      account: "账户与访问",
      models: "模型与执行",
      resources: "共享资源与网页访问",
      workspace: "工作目录",
      storage: "数据与存储",
      agents: "软件中心",
      capabilities: "能力配置",
      instructions: "指令",
      services: "服务状态",
      updates: "更新与修复",
      diagnostics: "日志与诊断",
      preferences: "偏好",
      about: "关于"
    }
  },
  en: {
    groups: {
      overview: "Overview",
      account_models: "Account & Models",
      connections_deployment: "Connections & Deployment",
      workspace: "Workspace",
      agents_capabilities: "Capabilities & Instructions",
      runtime_maintenance: "Runtime & Maintenance",
      preferences: "Preferences"
    },
    destinations: {
      overview: "Overview",
      account: "Account & Access",
      models: "Models & execution",
      resources: "Shared resources & web access",
      workspace: "Working Directory",
      storage: "Data & Storage",
      agents: "Software Center",
      capabilities: "Capability settings",
      instructions: "Instructions",
      services: "Service Status",
      updates: "Updates & Repair",
      diagnostics: "Logs & Diagnostics",
      preferences: "Preferences",
      about: "About"
    }
  }
} as const;

export function navigationGroups(locale: WorkbenchSettings["locale"]): NavigationGroup[] {
  const copy = navigationCopy[locale];
  return [
    { id: "overview", label: copy.groups.overview, destinations: [{ id: "overview", label: copy.destinations.overview }] },
    {
      id: "account_models",
      label: copy.groups.account_models,
      destinations: [
        { id: "account", label: copy.destinations.account },
        { id: "models", label: copy.destinations.models }
      ]
    },
    {
      id: "connections_deployment",
      label: copy.groups.connections_deployment,
      destinations: [{ id: "resources", label: copy.destinations.resources }]
    },
    {
      id: "workspace",
      label: copy.groups.workspace,
      destinations: [
        { id: "workspace", label: copy.destinations.workspace },
        { id: "storage", label: copy.destinations.storage }
      ]
    },
    {
      id: "agents_capabilities",
      label: copy.groups.agents_capabilities,
      destinations: [
        { id: "capabilities", label: copy.destinations.capabilities },
        { id: "instructions", label: locale === "zh" ? "指令与上下文" : "Instructions & Context" }
      ]
    },
    {
      id: "runtime_maintenance",
      label: copy.groups.runtime_maintenance,
      destinations: [
        { id: "services", label: copy.destinations.services },
        { id: "updates", label: copy.destinations.updates },
        { id: "diagnostics", label: copy.destinations.diagnostics }
      ]
    },
    {
      id: "preferences",
      label: copy.groups.preferences,
      destinations: [{ id: "preferences", label: copy.destinations.preferences }]
    }
  ];
}

export function settingsDestinations(locale: WorkbenchSettings["locale"]): NavigationDestination[] {
  return [
    ...navigationGroups(locale).map((group) => ({
      id: group.destinations[0]!.id,
      label: group.label
    })),
    { id: "about", label: navigationCopy[locale].destinations.about }
  ];
}

export function settingsSubDestinations(
  primaryDestination: SettingsDestinationId,
  locale: WorkbenchSettings["locale"]
): NavigationDestination[] {
  return navigationGroups(locale)
    .find((group) => group.destinations[0]?.id === primaryDestination)
    ?.destinations ?? [{ id: "about", label: navigationCopy[locale].destinations.about }];
}

export const searchableSettings: Array<{ destination: SettingsDestinationId | "memory"; labels: [string, string]; keywords?: string }> = [
  { destination: "preferences", labels: ["语言", "Language"] },
  { destination: "preferences", labels: ["外观", "Appearance"], keywords: "theme dark light 主题 深色 浅色" },
  { destination: "preferences", labels: ["字号大小", "Font size"], keywords: "字体 字号" },
  { destination: "preferences", labels: ["任务完成通知", "Task completion notifications"] },
  { destination: "models", labels: ["任务权限", "Task permissions"], keywords: "执行前确认 审批 confirmation approval access" },
  { destination: "models", labels: ["Auto Review", "自动审阅"], keywords: "approval review 审批" },
  { destination: "models", labels: ["时间上下文", "Time context"], keywords: "时间 时区 timezone" },
  { destination: "preferences", labels: ["快捷键", "Keyboard shortcuts"], keywords: "热键 hotkey" },
  { destination: "preferences", labels: ["语音输入", "Voice input"], keywords: "听写 录音 dictation recording" },
  { destination: "account", labels: ["余额", "Balance"], keywords: "账户 Gateway" },
  { destination: "account", labels: ["今日用量", "Usage today"], keywords: "令牌 tokens 费用 cost" },
  { destination: "account", labels: ["累计用量", "Total usage"] },
  { destination: "models", labels: ["模型", "Model"], keywords: "推理 reasoning 自动 auto" },
  { destination: "instructions", labels: ["记忆与纠错", "Memory and corrections"], keywords: "记忆 memory context 上下文" },
  { destination: "workspace", labels: ["当前项目", "Current project"], keywords: "文件夹 folder" },
  { destination: "diagnostics", labels: ["应用日志", "Application logs"] },
  { destination: "diagnostics", labels: ["反馈摘要", "Feedback summary"], keywords: "诊断 diagnostics" },
];

export type SettingsPagePresentation = {
  eyebrow: string;
  description: string;
};

export const settingsPagePresentation: Record<SettingsDestinationId, { zh: SettingsPagePresentation; en: SettingsPagePresentation }> = {
  overview: {
    zh: { eyebrow: "设置总览", description: "查看工作环境是否就绪，处理需要注意的问题。" },
    en: { eyebrow: "Settings overview", description: "Check that your workspace is ready and resolve issues that need attention." }
  },
  account: {
    zh: { eyebrow: "账户与访问", description: "连接 OPL Gateway 或使用 API Key，查看账户与用量。" },
    en: { eyebrow: "Account & access", description: "Connect OPL Gateway or use an API key, and review your account and usage." }
  },
  models: {
    zh: { eyebrow: "账户与模型", description: "选择模型来源和推理强度。自动模式遵循 OPL 的模型策略，并显示实际生效结果。" },
    en: { eyebrow: "Account & models", description: "Choose the model source and reasoning effort. Auto follows the OPL model policy and shows the effective result." }
  },
  resources: {
    zh: { eyebrow: "连接与部署", description: "打开共享资源，或配置独立网页端的访问方式。" },
    en: { eyebrow: "Connections & deployment", description: "Open shared resources or configure access to a separate WebUI deployment." }
  },
  workspace: {
    zh: { eyebrow: "工作区", description: "选择工作目录，确定项目文件的保存位置。" },
    en: { eyebrow: "Workspace", description: "Choose a working directory for your project files." }
  },
  storage: {
    zh: { eyebrow: "工作区 · 数据与存储", description: "查看本机数据占用，选择需要清理或保留的内容。" },
    en: { eyebrow: "Workspace · data & storage", description: "Review local storage and choose what to clean up or keep." }
  },
  agents: {
    zh: { eyebrow: "智能体与能力", description: "在软件中心管理智能体、版本和常用入口。" },
    en: { eyebrow: "Agents & capabilities", description: "Manage agents, versions and shortcuts in Software Center." }
  },
  capabilities: {
    zh: { eyebrow: "智能体与能力", description: "配置技能、MCP 与连接；软件安装和更新集中在软件中心。" },
    en: { eyebrow: "Agents & capabilities", description: "Configure skills, MCP and connections; manage installation and updates in Software Center." }
  },
  instructions: {
    zh: { eyebrow: "智能体与能力 · 指令与上下文", description: "设置工作习惯与补充说明，管理新会话使用的上下文。" },
    en: { eyebrow: "Agents & capabilities · instructions & context", description: "Set working preferences and additional instructions for new conversations." }
  },
  services: {
    zh: { eyebrow: "运行与维护", description: "检查后台服务是否就绪，处理影响任务执行的问题。" },
    en: { eyebrow: "Runtime & maintenance", description: "Check background services and scheduled tasks, and resolve runtime issues." }
  },
  updates: {
    zh: { eyebrow: "运行与维护", description: "检查应用和能力更新，修复不可用的组件。" },
    en: { eyebrow: "Runtime & maintenance", description: "Check for application and capability updates, and repair unavailable components." }
  },
  diagnostics: {
    zh: { eyebrow: "运行与维护", description: "查看日志和诊断信息，帮助定位或反馈问题。" },
    en: { eyebrow: "Runtime & maintenance", description: "Inspect logs and diagnostics to troubleshoot or report an issue." }
  },
  preferences: {
    zh: { eyebrow: "偏好", description: "调整语言、外观、字号、通知、快捷键和语音输入。" },
    en: { eyebrow: "Preferences", description: "Adjust language, appearance, font size, notifications, shortcuts, and voice input." }
  },
  about: {
    zh: { eyebrow: "关于", description: "查看版本、更新状态、安装指南和安全的反馈入口。" },
    en: { eyebrow: "About", description: "View the version, update status, installation guide, and a safe feedback entry point." }
  }
};

export function settingsPagePresentationFor(destination: SettingsDestinationId, locale: WorkbenchSettings["locale"]): SettingsPagePresentation {
  return settingsPagePresentation[destination][locale];
}
