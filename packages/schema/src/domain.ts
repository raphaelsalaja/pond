import { SOURCE_DESCRIPTORS } from "./sources/registry";

const HOST_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const descriptor of SOURCE_DESCRIPTORS) {
    const canonical = descriptor.hosts[0]?.toLowerCase();
    if (!canonical) continue;
    for (const host of descriptor.hosts) {
      map.set(host.toLowerCase(), canonical);
    }
  }
  return map;
})();

/** Strip www. and collapse platform aliases (x.com / twitter.com → one host). */
export function canonicalHost(hostname: string): string {
  const bare = hostname.replace(/^www\./i, "").toLowerCase();
  if (!bare) return bare;

  const exact = HOST_TO_CANONICAL.get(bare);
  if (exact) return exact;

  for (const [owned, canonical] of HOST_TO_CANONICAL) {
    if (bare.endsWith(`.${owned}`)) return canonical;
  }
  return bare;
}

export function domainFromUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl?.trim()) return null;
  try {
    const host = new URL(rawUrl).hostname;
    if (!host) return null;
    const canonical = canonicalHost(host);
    return canonical || null;
  } catch {
    return null;
  }
}

export function sourceIdentity(save: {
  siteName?: string | null;
  source?: string | null;
  url?: string | null;
}): string {
  const site = save.siteName?.trim().toLowerCase();
  if (site) return canonicalHost(site);

  if (save.source === "local") return "local";

  const fromUrl = domainFromUrl(save.url);
  if (fromUrl) return fromUrl;

  return (save.source ?? "").toLowerCase();
}
