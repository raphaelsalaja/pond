import { SOURCES } from "./source-ids";
import type { Source } from "./source-ids";
import { descriptorFor } from "./sources/registry";

export { canonicalHost, domainFromUrl, sourceIdentity } from "./domain";
export { hostToSource, sourceLabel } from "./source-ids";
export {
  DEFAULT_RATE_PROFILE,
  descriptorFor,
  EXTERNAL_SOURCE_IDS,
  type ExternalSource,
  GITHUB_REPO_PATTERN,
  SOURCE_DESCRIPTORS,
  syncConfigFor,
} from "./sources/registry";
export type {
  RateProfile,
  SourceDescriptor,
  SourceSyncConfig,
  SourceSyncOverride,
  SyncStrategy,
} from "./sources/types";

const SOURCE_SET: ReadonlySet<string> = new Set(SOURCES);

const SOURCE_ALIASES = new Map<string, Source>([
  ["x", "twitter"],
  ["are.na", "arena"],
]);

export function isSource(value: string): value is Source {
  return SOURCE_SET.has(value);
}

export function resolveSourceId(value: string): Source | null {
  const key = value.toLowerCase();
  const normalized = SOURCE_ALIASES.get(key) ?? key;
  return isSource(normalized) ? normalized : null;
}

export function connectsByHandle(source: Source): boolean {
  if (source === "web" || source === "local") return false;
  return descriptorFor(source).connect === "handle";
}

export function sourceIdFromUrl(source: Source, rawUrl: string): string | null {
  if (source === "local") return null;
  let href: string;
  try {
    href = new URL(rawUrl).href;
  } catch {
    return null;
  }
  if (source === "web") return href;
  for (const rx of descriptorFor(source).urlPatterns) {
    const match = rx.exec(href);
    if (match?.[1]) return match[1];
  }
  return null;
}
