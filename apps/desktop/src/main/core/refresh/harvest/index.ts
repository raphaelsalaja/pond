import type { Source } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { sourceIdFromUrl } from "@pond/schema/sources";
import * as arena from "./arena";
import * as behance from "./behance/item";
import * as bluesky from "./bluesky/item";
import * as cosmos from "./cosmos";
import * as dribbble from "./dribbble/item";
import type { HarvestAdaptCtx } from "./from-page";
import * as github from "./github/item";
import * as instagram from "./instagram";
import * as marked from "./marked/item";
import * as pinterest from "./pinterest";
import * as reddit from "./reddit";
import * as savee from "./savee/item";
import * as substack from "./substack/item";
import * as threads from "./threads";
import * as tiktok from "./tiktok";
import * as tumblr from "./tumblr/item";
import * as twitter from "./twitter";
import * as unsplash from "./unsplash/item";
import * as vimeo from "./vimeo/item";
import * as youtube from "./youtube";

interface Harvester {
  buildExpression: (sourceId: string) => string;
  adapt: (raw: JsonValue, ctx: HarvestAdaptCtx) => Capture | null;
  sourceIdFromUrl: (url: string) => string | null;
}

const REGISTRY = {
  twitter: {
    buildExpression: twitter.buildExpression,
    adapt: twitter.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("twitter", url),
  },
  instagram: {
    buildExpression: instagram.buildExpression,
    adapt: instagram.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("instagram", url),
  },
  youtube: {
    buildExpression: youtube.buildExpression,
    adapt: youtube.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("youtube", url),
  },
  pinterest: {
    buildExpression: pinterest.buildExpression,
    adapt: pinterest.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("pinterest", url),
  },
  tiktok: {
    buildExpression: tiktok.buildExpression,
    adapt: tiktok.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("tiktok", url),
  },
  arena: {
    buildExpression: arena.buildExpression,
    adapt: arena.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("arena", url),
  },
  cosmos: {
    buildExpression: cosmos.buildExpression,
    adapt: cosmos.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("cosmos", url),
  },
  reddit: {
    buildExpression: reddit.buildExpression,
    adapt: reddit.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("reddit", url),
  },
  threads: {
    buildExpression: threads.buildExpression,
    adapt: threads.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("threads", url),
  },
  github: {
    buildExpression: github.buildExpression,
    adapt: github.adapt,
    sourceIdFromUrl: (url) =>
      sourceIdFromUrl("github", url)?.toLowerCase() ?? null,
  },
  substack: {
    buildExpression: substack.buildExpression,
    adapt: substack.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("substack", url),
  },
  tumblr: {
    buildExpression: tumblr.buildExpression,
    adapt: tumblr.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("tumblr", url),
  },
  savee: {
    buildExpression: savee.buildExpression,
    adapt: savee.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("savee", url),
  },
  behance: {
    buildExpression: behance.buildExpression,
    adapt: behance.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("behance", url),
  },
  vimeo: {
    buildExpression: vimeo.buildExpression,
    adapt: vimeo.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("vimeo", url),
  },
  dribbble: {
    buildExpression: dribbble.buildExpression,
    adapt: dribbble.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("dribbble", url),
  },
  unsplash: {
    buildExpression: unsplash.buildExpression,
    adapt: unsplash.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("unsplash", url),
  },
  bluesky: {
    buildExpression: bluesky.buildExpression,
    adapt: bluesky.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("bluesky", url),
  },
  marked: {
    buildExpression: marked.buildExpression,
    adapt: marked.adapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("marked", url),
  },
  web: {
    buildExpression: () => {
      throw new Error("web source does not harvest via the window pool");
    },
    adapt: () => null,
    sourceIdFromUrl: (url) => sourceIdFromUrl("web", url),
  },
  local: {
    buildExpression: () => {
      throw new Error("local source is not harvestable");
    },
    adapt: () => null,
    sourceIdFromUrl: (url) => sourceIdFromUrl("local", url),
  },
} satisfies Record<Source, Harvester>;

export function harvesterFor(source: Source): Harvester {
  return REGISTRY[source];
}
