import type { ListKind, Source } from "@pond/schema/db";
import { mergeListKinds } from "@pond/schema/list-kinds";
import type { ImportableCookie } from "../refresh/harvest-window/session";
import { classifyUrlToSource } from "./extractors";
import { firstMatch, GITHUB_PATTERNS } from "./extractors/url-patterns";
import { listKindsFromTrigger } from "./list-kinds";
import type { EnqueueSeed } from "./seed";
import { sourceIdFromUrl } from "./url";

export interface EnqueueItem {
  url: string;
  seed?: EnqueueSeed;
  listKinds?: ListKind[];
}

export interface EnqueueOptions {
  trigger?: string;
  force?: boolean;
  seed?: EnqueueSeed;
  accountId?: string | null;
  /** Keep the current account owner when false. The default is true. */
  adoptOrphaned?: boolean;
  generationId?: string | null;
  cookies?: ImportableCookie[];
  listKinds?: ListKind[];
}

export interface EnqueueCandidate {
  url: string;
  source: Source;
  sourceId: string;
  seed?: EnqueueSeed;
  listKinds: ListKind[];
}

export interface NormalizedEnqueueItems {
  candidates: EnqueueCandidate[];
  failed: number;
}

/** Substack's share links wrap the publication's own post address. */
const OPEN_SUBSTACK_POST =
  /^open\.substack\.com\/pub\/([a-z0-9-]+)\/p\/([A-Za-z0-9_-]+)\/?$/i;

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        key.startsWith("utm_") ||
        key === "fbclid" ||
        key === "igshid" ||
        key === "si"
      ) {
        url.searchParams.delete(key);
      }
    }
    const repo = firstMatch(url, GITHUB_PATTERNS)?.[1];
    /** GitHub repo names are case-insensitive, so every spelling of a repo lands on one save. */
    if (repo) return `https://github.com/${repo.toLowerCase()}`;
    const shared = OPEN_SUBSTACK_POST.exec(`${url.host}${url.pathname}`);
    if (shared) return `https://${shared[1]}.substack.com/p/${shared[2]}`;
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function enqueueCandidateKey(
  candidate: Pick<EnqueueCandidate, "source" | "sourceId">,
): string {
  return `${candidate.source}\u0000${candidate.sourceId}`;
}

export function normalizeEnqueueItems(
  items: readonly EnqueueItem[],
  trigger: string | undefined,
): NormalizedEnqueueItems {
  const candidates: EnqueueCandidate[] = [];
  const byKey = new Map<string, EnqueueCandidate>();
  let failed = 0;

  for (const item of items) {
    const url = normalizeUrl(item.url);
    const { source } = classifyUrlToSource(url);
    if (!source) {
      failed += 1;
      continue;
    }
    const sourceId = sourceIdFromUrl(source, url);
    if (!sourceId) {
      failed += 1;
      continue;
    }
    const listKinds = mergeListKinds(
      item.listKinds,
      listKindsFromTrigger(trigger),
    );
    const key = enqueueCandidateKey({ source, sourceId });
    const previous = byKey.get(key);
    if (previous) {
      previous.listKinds = mergeListKinds(previous.listKinds, listKinds);
      continue;
    }
    const candidate: EnqueueCandidate = {
      url,
      source,
      sourceId,
      listKinds,
    };
    if (item.seed) candidate.seed = item.seed;
    byKey.set(key, candidate);
    candidates.push(candidate);
  }

  return { candidates, failed };
}
