import { useState } from "react";
import { AppWindow, Bot, Puzzle, Server, TerminalSquare } from "lucide-react";

/** Only immutable public owner assets reach the network from the renderer. */
export function publicSoftwareIconUrl(value?: string, privateAsset = false): string | undefined {
  if (!value || privateAsset) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[a-f0-9]{40}\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(svg|png|webp)$/.test(url.pathname)
      ? url.href : undefined;
  } catch { return undefined; }
}

export function SoftwareArtwork({ identity, label, kind, iconUrl, privateAsset = false }: {
  identity: string; label: string; kind?: string; iconUrl?: string; privateAsset?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = publicSoftwareIconUrl(iconUrl, privateAsset);
  const words = label.match(/[\p{L}\p{N}]+/gu) ?? [identity];
  const initials = words.length > 1 ? `${words[0][0]}${words.at(-1)![0]}`.toUpperCase() : words[0].slice(0, 2).toUpperCase();
  const tone = [...identity].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6;
  const Icon = kind === "agent" ? Bot : kind === "cli" ? TerminalSquare : kind === "runtime" ? Server : kind === "application" ? AppWindow : Puzzle;
  return <span className="opl-package-artwork" data-tone={tone} aria-hidden="true">
    {url && failedUrl !== url ? <img src={url} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <><span className="opl-package-initials">{initials}</span><Icon className="opl-package-type-icon" size={12} strokeWidth={1.8} /></>}
  </span>;
}
