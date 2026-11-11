import type { AgentPackageLocalizedText } from "./workbenchModel-package-contracts";

export function catalogDisplayName(name: string, localized: AgentPackageLocalizedText | undefined, locale: "zh" | "en") {
  return localized?.[locale]?.trim() || name;
}

export function SoftwareCatalogIdentity({ name, id, description, kind, publisher, channel }: {
  name: string; id: string; description?: string; kind?: string; publisher?: string; channel?: string;
}) {
  return <span className="agent-package-copy">
    <span className="software-catalog-title"><strong className="software-catalog-name">{name}</strong>{channel ? <span className="software-catalog-channel">{channel}</span> : null}</span>
    <span className="software-catalog-identity"><span>ID</span><code>{id}</code>{kind ? <span className="software-catalog-kind">{kind}</span> : null}</span>
    {description ? <small className="software-catalog-description">{description}</small> : null}
    {publisher ? <span className="software-catalog-publisher">{publisher}</span> : null}
  </span>;
}

export function SoftwareCatalogVersions({ installed, installedVersion, availableVersion, locale, installedLabel, missingLabel }: {
  installed: boolean | null; installedVersion?: string; availableVersion?: string; locale: "zh" | "en"; installedLabel?: string; missingLabel?: string;
}) {
  const zh = locale === "zh";
  return <span className="software-catalog-versions" data-testid="opl-package-version-summary">
    <span><span>{installedLabel ?? (zh ? "本机版本" : "Local version")}</span>{" "}<strong data-unknown={!installedVersion || undefined}>{installedVersion || (installed === false ? (missingLabel ?? (zh ? "未安装" : "Not installed")) : (zh ? "待确认" : "Not confirmed"))}</strong></span>
    <span><span>{zh ? "来源版本" : "Source version"}</span>{" "}<strong data-unknown={!availableVersion || undefined}>{availableVersion || "—"}</strong></span>
  </span>;
}

/** Shared metadata inside the upstream list and detail description slots. */
export function SoftwareCatalogSummary({ id, description, installed, installedVersion, availableVersion, locale, missingLabel }: {
  id: string; description: string; installed: boolean | null; installedVersion?: string; availableVersion?: string; locale: "zh" | "en"; missingLabel?: string;
}) {
  return <span className="opl-catalog-summary">
    <span className="opl-catalog-id"><span>ID</span> <code>{id}</code></span>
    <span className="opl-catalog-description">{description}</span>
    <SoftwareCatalogVersions missingLabel={missingLabel} installed={installed} installedVersion={installedVersion} availableVersion={availableVersion} locale={locale} />
  </span>;
}
