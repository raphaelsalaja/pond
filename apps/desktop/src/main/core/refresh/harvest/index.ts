import type { Source } from "@pond/schema/db";
import * as arena from "./arena";
import * as cosmos from "./cosmos";
import * as generic from "./generic";
import * as instagram from "./instagram";
import * as pinterest from "./pinterest";
import * as reddit from "./reddit";
import * as tiktok from "./tiktok";
import * as twitter from "./twitter";
import type { ScrapedHarvest } from "./types";
import * as youtube from "./youtube";

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
  youtube: {
    buildExpression: youtube.buildExpression,
    adapt: youtube.adapt,
    sourceIdFromUrl: youtube.sourceIdFromUrl,
  },
  pinterest: {
    buildExpression: pinterest.buildExpression,
    adapt: pinterest.adapt,
    sourceIdFromUrl: pinterest.sourceIdFromUrl,
  },
  tiktok: {
    buildExpression: tiktok.buildExpression,
    adapt: tiktok.adapt,
    sourceIdFromUrl: tiktok.sourceIdFromUrl,
  },
  arena: {
    buildExpression: arena.buildExpression,
    adapt: arena.adapt,
    sourceIdFromUrl: arena.sourceIdFromUrl,
  },
  cosmos: {
    buildExpression: cosmos.buildExpression,
    adapt: cosmos.adapt,
    sourceIdFromUrl: cosmos.sourceIdFromUrl,
  },
  reddit: {
    buildExpression: reddit.buildExpression,
    adapt: reddit.adapt,
    sourceIdFromUrl: reddit.sourceIdFromUrl,
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
