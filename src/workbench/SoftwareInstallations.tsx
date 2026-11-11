import { Button, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SoftwareActivationStatus, SoftwareInstallationRef, SoftwareSourceActionRef } from "./workbenchModel-package-contracts";
import { actionPayloadComplete, type SettingsActionRequest } from "./settingsActions";
import { activeSoftwareInstallation, catalogManagerLabel, softwareActivationLabel } from "./softwareCatalog";
import { nativeAvailableDisplayVersion, nativeSoftwareProducts, softwareSourceActionLabel } from "./softwareSources";

function installationActionLabel(action: SoftwareSourceActionRef, locale: "zh" | "en") {
  const operation = String(action.payload.operation ?? action.actionId);
  const names: Record<string, [string, string]> = {
    activate: ["设为当前使用", "Use this installation"],
    deactivate: ["停用此安装", "Deactivate"],
    unlink: ["解除开发接入", "Unlink development checkout"],
    update: ["更新此安装", "Update installation"],
    uninstall: ["卸载此安装", "Uninstall installation"],
    inspect: ["检查此安装", "Inspect installation"],
  };
  return names[operation]?.[locale === "zh" ? 0 : 1] ?? softwareSourceActionLabel(action.actionId, locale, action.label);
}

export function SoftwareInstallations({ installations, activeId, activationStatus, locale, actionBusyKey, onAction, onUpdates }: {
  installations: SoftwareInstallationRef[];
  activeId?: string;
  activationStatus?: SoftwareActivationStatus;
  locale: "zh" | "en";
  actionBusyKey: string | null;
  onAction(request: SettingsActionRequest): void;
  onUpdates?: () => void;
}) {
  const zh = locale === "zh";
  const active = activeSoftwareInstallation(installations, activeId, activationStatus);
  return <section className="opl-dsh-owner-section" data-testid="opl-software-installations">
    <h4>{zh ? "本机安装" : "Installations on this device"}</h4>
    <p>{zh ? "每份安装分别管理；同一环境只使用一个激活实例。" : "Manage each installation separately; one is active in this environment."}</p>
    {!installations.length ? <p>{zh ? "本机没有此软件的安装记录。" : "No installation of this software was found on this device."}</p> : installations.map(installation => {
      const current = active?.installationId === installation.installationId;
      const actions = installation.availableActions.filter(action => action.status === "available"
        && action.payload.installation_id === installation.installationId
        && (!installation.revision || action.payload.expected_revision === installation.revision)
        && actionPayloadComplete(action.payload, action.payloadFields)
        && (installation.mode !== "development" || ["activate", "deactivate", "unlink", "inspect"].includes(String(action.payload.operation))));
      return <div className="opl-software-installation" key={installation.installationId} data-testid="opl-local-installation" data-installation-id={installation.installationId}>
        <div className="opl-software-installation-heading"><strong>{installation.displayVersion ?? installation.version}</strong><Tag tone="quiet">{installation.mode === "development" ? (zh ? "开发版" : "Development") : (zh ? "发布版" : "Release")}</Tag><span>{current ? (zh ? "当前使用" : "In use") : installation.active ? softwareActivationLabel(activationStatus === "conflict" ? "conflict" : "unknown", locale) : (zh ? "未激活" : "Inactive")}</span></div>
        <dl><div><dt>{zh ? "安装位置" : "Location"}</dt><dd><code>{installation.location}</code></dd></div><div><dt>{zh ? "管理方式" : "Managed by"}</dt><dd>{catalogManagerLabel(installation.manager, locale)}</dd></div>{installation.availableVersion ? <div><dt>{zh ? "可用版本" : "Available version"}</dt><dd>{installation.availableVersion}</dd></div> : null}</dl>
        {installation.mode === "development" ? <p>{zh ? "代码由开发工具维护；解除接入会保留源码和数据。" : "Development tools maintain this code. Unlinking preserves source and data."}</p> : null}
        {actions.length ? <div className="opl-software-installation-actions">{actions.map(action => <Button key={action.actionId + String(action.payload.operation ?? "")} size="sm" variant="outline" disabled={actionBusyKey !== null} onClick={() => onAction({ key: `installation:${installation.installationId}:${action.actionId}:${String(action.payload.operation ?? "")}`, actionId: action.actionId, label: `${installationActionLabel(action, locale)} · ${installation.displayVersion ?? installation.version}`, payload: action.payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported })}>{installationActionLabel(action, locale)}</Button>)}</div> : installation.ownerSettingsRoute === "updates" && onUpdates ? <Button size="sm" variant="outline" onClick={onUpdates}>{zh ? "管理此安装" : "Manage installation"}</Button> : null}
      </div>;
    })}
    {!active && installations.length ? <p role={activationStatus === "conflict" ? "alert" : undefined}>{softwareActivationLabel(activationStatus, locale)}</p> : null}
  </section>;
}

export function SoftwareReleaseOptions({ product, locale, actionBusyKey, onAction }: {
  product: ReturnType<typeof nativeSoftwareProducts>[number];
  locale: "zh" | "en";
  actionBusyKey: string | null;
  onAction(request: SettingsActionRequest): void;
}) {
  const zh = locale === "zh";
  if (!product.channels.length) return null;
  return <section className="opl-dsh-owner-section" data-testid="opl-software-releases">
    <h4>{zh ? "获取其他版本" : "Available releases"}</h4>
    <p>{zh ? "以下是安装选项；安装位置和激活状态见“本机安装”。" : "These are installation options. Locations and active state are listed under installations."}</p>
    {product.channels.map(({ source, item }) => {
      const install = item.availableActions.find(action => action.actionId === "source_install" && action.status === "available"
        && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId
        && action.payload.expected_revision === item.revision && actionPayloadComplete(action.payload, action.payloadFields));
      return <div className="opl-software-installation" key={`${source.sourceId}:${item.itemId}`}>
        <div className="opl-software-installation-heading"><strong>{nativeAvailableDisplayVersion(item) ?? "—"}</strong>{item.recommendedForProduct ? <Tag tone="quiet">{zh ? "默认推荐" : "Recommended"}</Tag> : null}{item.selectedForProduct ? <span>{zh ? "当前更新来源" : "Selected update source"}</span> : null}</div>
        <dl><div><dt>{zh ? "软件源" : "Source"}</dt><dd>{source.displayName}</dd></div>{item.releaseChannel ? <div><dt>{zh ? "发布轨道" : "Release track"}</dt><dd>{item.releaseChannel === "nightly" ? "Nightly" : "Stable"}</dd></div> : null}{item.installationVariant && item.installationVariant !== "default" ? <div><dt>{zh ? "安装规格" : "Edition"}</dt><dd>{item.installationVariant === "full" ? (zh ? "完整包 · Full" : "Full") : (zh ? "标准包 · Standard" : "Standard")}</dd></div> : null}<div><dt>{zh ? "安装器" : "Installer"}</dt><dd>{catalogManagerLabel(item.catalogSource?.manager ?? source.catalogSource?.manager, locale)}</dd></div></dl>
        {install ? <Button size="sm" variant="outline" disabled={actionBusyKey !== null} onClick={() => onAction({ key: `source:${source.sourceId}:${item.itemId}:${install.actionId}`, actionId: install.actionId, label: `${zh ? "安装" : "Install"} ${item.displayName} ${nativeAvailableDisplayVersion(item) ?? ""}`, payload: install.payload, confirmationRequired: install.confirmationRequired, dryRunSupported: install.dryRunSupported })}>{zh ? "安装此版本" : "Install this version"}</Button> : null}
      </div>;
    })}
  </section>;
}
