import { ChevronDown } from "lucide-react";

import type { NativeAppUpdateResult } from "../../bridge/oplBridge";
import type { ManagedUpdateComponentRef, ManagedRuntimeDependencyRef, ManagedPackageStateRef } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";
import type { SettingsActionFeedback } from "./types";

import { type SettingsExecutableIntent, type SettingsActionRequest, type SettingsHostActionIntent } from "../settingsActions";

import { SettingRow, SettingsGroup, StatusValue } from "./primitives";
import { SettingsIntentButton } from "./actions";

export function formatUpdateChannel(value: string | undefined, locale: WorkbenchSettings["locale"]): string {
  if (!value) return locale === "zh" ? "默认" : "Default";
  const normalized = value.toLowerCase();
  if (normalized === "stable") return locale === "zh" ? "稳定版" : "Stable";
  if (normalized === "preview" || normalized === "beta") return locale === "zh" ? "预览版" : "Preview";
  return locale === "zh" ? "自定义" : "Custom";
}

export function formatUpdatePolicy(value: string | undefined, eligible: boolean | null | undefined, locale: WorkbenchSettings["locale"]): string {
  const normalized = value?.toLowerCase();
  if (normalized && ["silent_managed", "silent_background", "controlled_apply", "eligible_native_packages", "projection_only", "automatic", "auto", "enabled"].includes(normalized)) {
    return locale === "zh" ? "自动（静默）" : "Automatic (silent)";
  }
  if (normalized === "native_host") {
    return locale === "zh" ? "由 App 更新器管理" : "Managed by the App updater";
  }
  if (normalized === "detect_only_guidance") {
    return locale === "zh" ? "仅检测并提示" : "Detection and guidance only";
  }
  if (normalized && ["manual", "explicit", "disabled", "prompt_only"].includes(normalized)) {
    return locale === "zh" ? "手动" : "Manual";
  }
  if (eligible === true) return locale === "zh" ? "自动（静默）" : "Automatic (silent)";
  if (eligible === false) return locale === "zh" ? "待处理" : "Needs attention";
  return locale === "zh" ? "待确认" : "Not available";
}

export function isDefaultSilentManagedComponent(component: ManagedUpdateComponentRef | undefined): boolean {
  if (!component || component.componentId === "opl_app") return false;
  return ["silent_managed", "silent_background", "controlled_apply", "eligible_native_packages", "projection_only"].includes(component.autoApplyMode?.toLowerCase() ?? "");
}

export function managedDependencyLabel(dependencyId: string, locale: WorkbenchSettings["locale"]): string {
  const labels: Record<string, [string, string]> = {
    "codex-cli": ["Codex CLI", "Codex CLI"],
    "officecli": ["OfficeCLI", "OfficeCLI"],
    "mineru-open-api": ["MinerU", "MinerU"],
    "gh-stack": ["gh-stack", "gh-stack"],
    "ffmpeg": ["FFmpeg", "FFmpeg"]
  };
  return labels[dependencyId]?.[locale === "zh" ? 0 : 1] ?? dependencyId;
}

export function managedDependencySummary(dependency: ManagedRuntimeDependencyRef, locale: WorkbenchSettings["locale"]): string {
  const zh = locale === "zh";
  if (dependency.dependencyId === "codex-cli") {
    return zh ? `核心 AI 执行引擎 · ${managedDependencyPolicyLabel(dependency.updateMode, dependency.updatePolicy, locale)}` : `Core AI execution engine · ${managedDependencyPolicyLabel(dependency.updateMode, dependency.updatePolicy, locale)}`;
  }
  if (dependency.updatePolicy === "updated_with_opl_base_framework_generation") {
    return zh ? "随 OPL 基座更新" : "Updated with OPL Base";
  }
  return managedDependencyPolicyLabel(dependency.updateMode, dependency.updatePolicy, locale);
}

export function managedDependencyMissingPackages(value: ManagedRuntimeDependencyRef["version"] | undefined): string[] {
  if (!value || typeof value === "string") return [];
  return Object.entries(value).filter(([, item]) => !item).map(([key]) => key);
}

export function managedDependencyPolicyLabel(updateMode: string | undefined, updatePolicy: string | undefined, locale: WorkbenchSettings["locale"]): string {
  const zh = locale === "zh";
  // Execution mode is authoritative; policy may also describe no direct overwrite.
  if (updateMode === "explicit_owner_delegated") return zh
    ? "确认后由原安装器更新" : "Update through the original installer after confirmation";
  if (updateMode === "silent_managed") return zh
    ? "由 OPL 托管自动更新" : "Automatically updated by OPL";
  if (updateMode === "detect_only_guidance") return zh
    ? "仅检测并提示，不自动接管维护" : "Detection and guidance only; maintenance is not adopted automatically";
  if (updateMode === "manual" || updateMode === "explicit") return zh ? "手动更新" : "Manual update";
  return zh ? "维护方式待确认" : "Maintenance policy not confirmed";
}

export function managedPackageUpdateLabel(packageState: Pick<ManagedPackageStateRef, "updateMode" | "autoApplyEligible" | "backgroundUpdateReason">, locale: WorkbenchSettings["locale"]): string {
  const zh = locale === "zh";
  const reasons: Record<string, [string, string]> = {
    external_package_explicit_update_only: ["按来源策略手动更新", "Manual update required by source policy"],
    local_or_user_managed_source: ["本地或用户管理的来源：不自动覆盖", "Local or user-managed source: no automatic overwrite"],
    user_disabled_package: ["已停用：暂停自动更新", "Disabled: automatic updates paused"],
    native_carrier_attention_required: ["安装状态需修复：暂不能自动更新", "Installation needs repair: automatic updates temporarily unavailable"],
    package_not_installed: ["尚未安装", "Not installed"]
  };
  const reason = packageState.backgroundUpdateReason && reasons[packageState.backgroundUpdateReason];
  if (reason) return reason[zh ? 0 : 1];
  return managedDependencyPolicyLabel(packageState.updateMode, undefined, locale);
}

export function managedDependencyVersion(value: ManagedRuntimeDependencyRef["version"] | undefined, locale?: WorkbenchSettings["locale"]): string {
  if (!value) return "--";
  if (typeof value === "string") return value;
  const entries = Object.entries(value).filter(([, item]) => item || locale);
  return entries.length ? entries.map(([key, item]) => `${key} ${item ?? (locale === "zh" ? "缺失" : "missing")}`).join(", ") : "--";
}

/** A compact version for catalog rows; details retain the complete owner readback. */
export function managedDependencyVersionSummary(value: ManagedRuntimeDependencyRef["version"] | undefined): string {
  if (!value) return "—";
  if (typeof value !== "string") {
    const versions = [...new Set(Object.values(value).filter((item): item is string => Boolean(item)))];
    return versions.length === 1 ? managedDependencyVersionSummary(versions[0]) : managedDependencyVersion(value);
  }
  const firstLine = value.trim().split(/\r?\n/, 1)[0];
  return firstLine.match(/(?:^|\b)v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/)?.[1] || firstLine || "—";
}

export function ManagedUpdateGroup({
  component,
  nativeUpdate,
  fallbackLabel,
  actions,
  locale,
  busyKey,
  onAction,
  onHostAction,
  unavailableActionLabel
}: {
  component?: ManagedUpdateComponentRef;
  nativeUpdate?: NativeAppUpdateResult | null;
  fallbackLabel: string;
  actions: SettingsExecutableIntent[];
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  unavailableActionLabel?: string;
}) {
  const unpackagedPreview = nativeUpdate?.reasonCode === "desktop_updater_requires_packaged_app";
  const version = unpackagedPreview ? (locale === "zh" ? "未发布" : "Unreleased") : nativeUpdate?.currentVersion
    ? nativeUpdate.targetVersion && nativeUpdate.targetVersion !== nativeUpdate.currentVersion
      ? `${nativeUpdate.currentVersion} -> ${nativeUpdate.targetVersion}`
      : nativeUpdate.currentVersion
    : component?.installedVersion
    ? component.latestVersion && component.latestVersion !== component.installedVersion
      ? `${component.installedVersion} -> ${component.latestVersion}`
      : component.installedVersion
    : component?.latestVersion ?? "--";
  const autoPolicy = nativeUpdate
    ? nativeUpdate.supported
      ? nativeUpdate.automatic === true
        ? (locale === "zh" ? "后台检查与下载，退出时安装；也可选择立即重启。" : "Checks and downloads in the background; installs on quit, or restart now.")
        : (locale === "zh" ? "手动检查与下载，准备就绪后重启安装。" : "Check and download manually, then restart to install.")
      : (locale === "zh" ? "插件、扩展与运行组件仍会在后台自动更新。" : "Plugins, extensions, and runtime components still update automatically.")
    : component?.componentId === "opl_base"
      ? (locale === "zh" ? "仅显示当前版本" : "Current version only")
      : formatUpdatePolicy(component?.autoApplyMode, component?.autoApplyEligible, locale);
  const nativeUpdateSource = nativeUpdate?.supported
    ? (locale === "zh" ? "已配置" : "Configured")
    : nativeUpdate?.buildKind === "local-development"
      ? (locale === "zh" ? "本地开发版不接收公开自动更新" : "Local development builds do not receive public updates")
    : nativeUpdate?.reasonCode === "desktop_updater_requires_packaged_app"
      ? (locale === "zh" ? "开发预览包不启用自动更新" : "Automatic updates are disabled in a development preview")
      : nativeUpdate?.reasonCode === "desktop_update_config_unavailable"
        ? (locale === "zh" ? "当前安装包缺少更新源配置" : "The installed package has no update source configuration")
        : nativeUpdate?.reasonCode
          ? (locale === "zh" ? "当前运行方式不支持安装包自更新" : "App shell self-updates are not enabled in this runner")
          : undefined;
  const downloadPercent = nativeUpdate?.state === "downloading" && typeof nativeUpdate.progressPercent === "number" && Number.isFinite(nativeUpdate.progressPercent)
    ? Math.max(0, Math.min(100, Math.round(nativeUpdate.progressPercent)))
    : null;
  const explicitPackageUpdate = component?.packageStates?.some((packageState) =>
    ["update_available", "staged", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(packageState.state.toLowerCase())
  ) ?? false;
  const renderableActions = actions.filter((intent) => {
    const isManagedApply = intent.transport !== "app_action" && "operation" in intent && intent.operation === "apply";
    return nativeUpdate?.supported !== false && intent.availability === "ready"
      && (intent.transport === "app_action" || Boolean(onHostAction))
      && !(isDefaultSilentManagedComponent(component) && isManagedApply && component?.state !== "failed_with_repair" && !explicitPackageUpdate);
  });
  return (
    <SettingsGroup title={fallbackLabel}>
      <SettingRow label={locale === "zh" ? "状态" : "Status"}>
        <span className="runtime-setting-control">
          <StatusValue status={unpackagedPreview ? "development_preview" : nativeUpdate?.buildKind === "local-development" ? "local_development" : nativeUpdate?.state === "not_available" ? "current" : nativeUpdate?.state ?? component?.state} locale={locale} />
          {downloadPercent !== null ? <span>{downloadPercent}%</span> : null}
          {renderableActions.length
            ? renderableActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={locale} busyKey={busyKey} onAction={onAction} onHostAction={onHostAction} />)
            : null}
        </span>
      </SettingRow>
      {nativeUpdate?.state === "error" ? <SettingRow label={locale === "zh" ? "失败原因" : "Failure reason"}><span role="alert">{nativeUpdate.message || (locale === "zh" ? "无法连接桌面更新源，请检查网络后重试。" : "Could not reach the desktop update feed. Check your network and try again.")}</span></SettingRow> : null}
      {version !== "--" ? <SettingRow label={locale === "zh" ? "版本" : "Version"}><span>{version}</span></SettingRow> : null}
      {component?.currentness && component.currentness !== component.state && component.currentness !== "unknown" ? <SettingRow label={locale === "zh" ? "当前状态" : "Currentness"}><StatusValue status={component.currentness} locale={locale} /></SettingRow> : null}
      {nativeUpdate ? <SettingRow label={locale === "zh" ? "更新源" : "Update source"}><span>{nativeUpdateSource ?? "--"}</span></SettingRow> : null}
      <SettingRow label={nativeUpdate ? (locale === "zh" ? "更新方式" : "Update behavior") : (locale === "zh" ? "默认更新策略" : "Default update policy")}><span>{autoPolicy}</span></SettingRow>
      {component?.runtimeDependencies?.length ? <details className="settings-advanced-actions" data-testid="managed-runtime-dependencies">
        <summary>{locale === "zh" ? `内部运行依赖 ${component.runtimeDependencies.length} 项` : `${component.runtimeDependencies.length} internal runtime dependencies`}<ChevronDown aria-hidden="true" size={14} /></summary>
        <div>{component.runtimeDependencies.map((dependency) => <SettingRow key={dependency.dependencyId} label={managedDependencyLabel(dependency.dependencyId, locale)} detail={[managedDependencyVersion(dependency.version), managedDependencyPolicyLabel(dependency.updateMode, dependency.updatePolicy, locale)].filter(Boolean).join(" · ")}><StatusValue status={dependency.currentness || dependency.status} locale={locale} /></SettingRow>)}</div>
      </details> : null}
      {component?.packageStates?.length ? <details className="settings-advanced-actions" data-testid="managed-package-states">
        <summary>{locale === "zh" ? `已安装 Agent 与能力包 ${component.packageStates.length} 项` : `${component.packageStates.length} installed Agents and capability packages`}<ChevronDown aria-hidden="true" size={14} /></summary>
        <div>{component.packageStates.map((packageState) => <SettingRow key={packageState.packageId} label={packageState.label} detail={[packageState.packageVersion, managedPackageUpdateLabel(packageState, locale)].filter(Boolean).join(" · ")}><StatusValue status={packageState.state || packageState.carrierStatus || "unknown"} locale={locale} /></SettingRow>)}</div>
      </details> : null}
    </SettingsGroup>
  );
}

/** Translate native app / DSH plugin host update and restart outcomes into accurate user feedback. */
export function nativeAppUpdateFeedback(
  result: NativeAppUpdateResult,
  operation: SettingsHostActionIntent["operation"],
  locale: WorkbenchSettings["locale"]
): SettingsActionFeedback {
  const zh = locale === "zh";
  if (result.state === "error") {
    return {
      tone: "attention",
      message: result.message || (zh ? "更新操作失败，请检查网络或更新源后重试。" : "The update operation failed. Check your network or update source and try again.")
    };
  }
  if (result.accepted === false) {
    if (result.reasonCode === "app_server_busy") {
      return { tone: "attention", message: zh ? "当前仍有任务正在运行，请等待任务完成后再重启应用。" : "A task is still running. Wait for it to finish before restarting the app." };
    }
    if (result.reasonCode === "downloaded_update_required") {
      return { tone: "attention", message: zh ? "当前没有待安装的应用更新。" : "No downloaded app update is waiting to install." };
    }
    if (result.reasonCode === "desktop_restart_preparation_failed" || result.errorCode === "desktop_restart_preparation_failed") {
      return { tone: "attention", message: zh ? "重启前准备未完成，请手动重启应用以使更新生效。" : "Restart preparation failed. Restart the app manually to apply the updates." };
    }
    return {
      tone: "attention",
      message: result.message || (zh ? "当前操作未能执行，请检查更新状态后重试。" : "The operation could not be completed. Check update status and try again.")
    };
  }
  if (!result.supported) {
    if (operation === "restart" && result.accepted === true) {
      return { tone: "success", message: zh ? "正在重启应用以使更新生效…" : "Restarting the app to apply updates…" };
    }
    if (result.buildKind === "local-development") {
      return { tone: "neutral", message: zh ? "本地开发版不接收公开安装包自动更新。" : "Local development builds do not receive public installer updates." };
    }
    if (result.reasonCode === "desktop_updater_requires_packaged_app") {
      return { tone: "neutral", message: zh ? "开发预览环境不支持桌面安装包自更新。" : "Desktop installer self-updates are unavailable in a development preview." };
    }
    return {
      tone: "attention",
      message: result.message || (zh ? "当前运行环境不支持安装包自更新。" : "Installer self-updates are unavailable in this runtime.")
    };
  }
  if (operation === "restart" || result.state === "restart_scheduled") {
    return { tone: "success", message: zh ? "正在重启应用以使更新生效…" : "Restarting the app to apply updates…" };
  }
  if (result.state === "downloaded") {
    return {
      tone: "success",
      message: result.targetVersion
        ? (zh ? `新版本 ${result.targetVersion} 已下载完成，重启应用即可安装。` : `Version ${result.targetVersion} is downloaded. Restart the app to install it.`)
        : (zh ? "更新已下载完成，重启应用即可安装。" : "Update downloaded. Restart the app to install it.")
    };
  }
  if (result.state === "downloading") {
    return {
      tone: "neutral",
      message: result.targetVersion
        ? (zh ? `正在下载新版本 ${result.targetVersion}…` : `Downloading version ${result.targetVersion}…`)
        : (zh ? "正在下载应用更新…" : "Downloading app update…")
    };
  }
  if (result.state === "available") {
    return {
      tone: "neutral",
      message: result.targetVersion
        ? (zh ? `发现新版本 ${result.targetVersion}，可在更新页下载安装。` : `Version ${result.targetVersion} is available to download and install.`)
        : (zh ? "发现可用更新，可在更新页下载安装。" : "An update is available to download and install.")
    };
  }
  if (result.state === "not_available") {
    return {
      tone: "success",
      message: result.currentVersion
        ? (zh ? `当前已是最新版本（${result.currentVersion}）。` : `You are up to date (${result.currentVersion}).`)
        : (zh ? "当前已是最新版本。" : "You are up to date.")
    };
  }
  if (result.state === "checking") {
    return { tone: "neutral", message: zh ? "正在检查更新…" : "Checking for updates…" };
  }
  return { tone: "neutral", message: zh ? "已刷新更新状态。" : "Update status refreshed." };
}
