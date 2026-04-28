import type { Source } from "@pond/schema/db";
import * as generic from "./generic";
import * as instagram from "./instagram";
import * as twitter from "./twitter";
import type { ScrapedHarvest } from "./types";

/**
 * One harvester per source. Each module owns:
 *   - `buildExpression(sourceId)` -> a self-contained JS expression we
 *     pass to `webContents.executeJavaScript`. The expression resolves
 *     to a JSON-serialisable scrape result (or null on failure).
 *   - `adapt(raw)` -> normalise the in-page result into the canonical
 *     `ScrapedHarvest` shape used by the ingest path.
 *   - `sourceIdFromUrl(url)` -> derive a stable scoping id from the
 *     URL so the merge-on-duplicate code in `ingest.ts` finds the
 *     existing row.
 *
 * Sources without a bespoke harvester fall back to `generic` (OG meta
 * tags read inside the page after JS hydration) — useful for SPAs where
 * the server-side `og.ts` reader sees an empty shell.
 */
export interface Harvester {
  buildExpression: (sourceId: string) => string;
  adapt: (raw: unknown) => ScrapedHarvest | null;
  sourceIdFromUrl: (url: string) => string | null;
}

const REGISTRY: Partial<Record<Source, Harvester>> = {
  twitter: {
    buildExpression: twitter.buildExpression,
    adapt: twitter.adapt,
    sourceIdFromUrl: twitter.sourceIdFromUrl,
  },
  instagram: {
    buildExpression: instagram.buildExpression,
    adapt: instagram.adapt,
    sourceIdFromUrl: instagram.sourceIdFromUrl,
  },
};

export function harvesterFor(source: Source | null): Harvester {
  if (source && REGISTRY[source]) return REGISTRY[source] as Harvester;
  return {
    buildExpression: () => generic.buildExpression(),
    adapt: generic.adapt,
    sourceIdFromUrl: (url) => generic.sourceIdFromUrl(url),
  };
}
