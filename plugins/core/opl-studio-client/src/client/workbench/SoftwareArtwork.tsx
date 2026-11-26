import { useEffect, useState } from "react";
import { genericSoftwareIconUrl, localSoftwareIconUrl } from "./softwareArtworkRegistry";

/** Only immutable public PNG/WebP owner assets reach the network from the renderer. */
export function publicSoftwareIconUrl(value?: string, privateAsset = false): string | undefined {
  if (!value || privateAsset) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[a-f0-9]{40}\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(png|webp)$/.test(url.pathname)
      ? url.href : undefined;
  } catch { return undefined; }
}

export function SoftwareArtwork({ identity, label, kind, iconUrl, privateAsset = false }: {
  identity: string; label: string; kind?: string; iconUrl?: string; privateAsset?: boolean;
}) {
  const localUrl = localSoftwareIconUrl(identity);
  const remoteUrl = localUrl ? undefined : publicSoftwareIconUrl(iconUrl, privateAsset);
  const candidates = [...new Set([localUrl, remoteUrl, genericSoftwareIconUrl].filter((value): value is string => Boolean(value)))];
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  useEffect(() => setFailedUrls(new Set()), [identity, iconUrl, privateAsset]);
  const url = candidates.find(candidate => !failedUrls.has(candidate));
  const source = url === localUrl ? "bundled" : url === remoteUrl ? "public-remote" : "generic";
  const markFailed = (failed: string) => setFailedUrls(previous => {
    const next = new Set(previous);
    next.add(failed);
    return next;
  });
  return <span className="opl-package-artwork" data-artwork-source={source} aria-hidden="true">
    {url ? <img src={url} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" onError={() => markFailed(url)} /> : null}
  </span>;
}
