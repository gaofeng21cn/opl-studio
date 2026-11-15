import { useState } from "react";
import { AppWindow, Bot, ImageOff, Puzzle, Server, TerminalSquare } from "lucide-react";

/** Local, bounded PNG artwork needs no network or credentials. Remote assets stay public and immutable. */
export function publicSoftwareIconUrl(value?: string, privateAsset = false): string | undefined {
  if (!value) return undefined;
  if (value.length <= 174786 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) return value;
  if (privateAsset) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[a-f0-9]{40}\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(svg|png|webp)$/.test(url.pathname)
      ? url.href : undefined;
  } catch { return undefined; }
}

export function SoftwareArtwork({ identity, label, kind, iconUrl, privateAsset = false, firstParty = false, locale = "zh" }: {
  identity: string; label: string; kind?: string; iconUrl?: string; privateAsset?: boolean; firstParty?: boolean; locale?: "zh" | "en";
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = publicSoftwareIconUrl(iconUrl, privateAsset);
  const available = Boolean(url && failedUrl !== url && (!firstParty || !url.endsWith(".svg")));
  const Icon = firstParty ? ImageOff : kind === "agent" ? Bot : kind === "cli" ? TerminalSquare : kind === "runtime" ? Server : kind === "application" ? AppWindow : Puzzle;
  return <span className="opl-package-artwork" data-software-id={identity} data-artwork-state={available ? "image" : "unavailable"} title={!available ? `${label} · ${locale === "zh" ? "图标暂不可用" : "Icon unavailable"}` : undefined} aria-hidden="true">
    {available ? <img src={url} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <Icon size={20} strokeWidth={1.5} />}
  </span>;
}
