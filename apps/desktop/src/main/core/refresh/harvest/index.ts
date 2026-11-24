import type { Source } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { sourceIdFromUrl } from "@pond/schema/sources";
import {
  adapt as arenaAdapt,
  buildExpression as arenaExpression,
} from "./arena";
import {
  adapt as behanceAdapt,
  buildExpression as behanceExpression,
} from "./behance/item";
import {
  adapt as blueskyAdapt,
  buildExpression as blueskyExpression,
} from "./bluesky/item";
import {
  adapt as cosmosAdapt,
  buildExpression as cosmosExpression,
} from "./cosmos";
import {
  adapt as dribbbleAdapt,
  buildExpression as dribbbleExpression,
} from "./dribbble/item";
import type { HarvestAdaptCtx } from "./from-page";
import {
  adapt as githubAdapt,
  buildExpression as githubExpression,
} from "./github/item";
import {
  adapt as instagramAdapt,
  buildExpression as instagramExpression,
} from "./instagram";
import {
  adapt as linkedinAdapt,
  buildExpression as linkedinExpression,
} from "./linkedin/item";
import {
  adapt as markedAdapt,
  buildExpression as markedExpression,
} from "./marked/item";
import {
  adapt as pinterestAdapt,
  buildExpression as pinterestExpression,
} from "./pinterest";
import {
  adapt as redditAdapt,
  buildExpression as redditExpression,
} from "./reddit";
import {
  adapt as saveeAdapt,
  buildExpression as saveeExpression,
} from "./savee/item";
import {
  adapt as substackAdapt,
  buildExpression as substackExpression,
} from "./substack/item";
import {
  adapt as threadsAdapt,
  buildExpression as threadsExpression,
} from "./threads";
import {
  adapt as tiktokAdapt,
  buildExpression as tiktokExpression,
} from "./tiktok";
import {
  adapt as tumblrAdapt,
  buildExpression as tumblrExpression,
} from "./tumblr/item";
import {
  adapt as twitterAdapt,
  buildExpression as twitterExpression,
} from "./twitter";
import {
  adapt as unsplashAdapt,
  buildExpression as unsplashExpression,
} from "./unsplash/item";
import {
  adapt as vimeoAdapt,
  buildExpression as vimeoExpression,
} from "./vimeo/item";
import {
  adapt as youtubeAdapt,
  buildExpression as youtubeExpression,
  urlForHarvest as youtubeUrlForHarvest,
} from "./youtube";

interface Harvester {
  buildExpression: (sourceId: string) => string;
  adapt: (raw: JsonValue, ctx: HarvestAdaptCtx) => Capture | null;
  sourceIdFromUrl: (url: string) => string | null;
  /** Rewrites a Save's URL into the page the scraper can read, when the saved form renders a different UI. */
  urlForHarvest?: (url: string) => string;
}

const REGISTRY = {
  twitter: {
    buildExpression: twitterExpression,
    adapt: twitterAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("twitter", url),
  },
  instagram: {
    buildExpression: instagramExpression,
    adapt: instagramAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("instagram", url),
  },
  youtube: {
    buildExpression: youtubeExpression,
    adapt: youtubeAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("youtube", url),
    urlForHarvest: youtubeUrlForHarvest,
  },
  pinterest: {
    buildExpression: pinterestExpression,
    adapt: pinterestAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("pinterest", url),
  },
  tiktok: {
    buildExpression: tiktokExpression,
    adapt: tiktokAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("tiktok", url),
  },
  arena: {
    buildExpression: arenaExpression,
    adapt: arenaAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("arena", url),
  },
  cosmos: {
    buildExpression: cosmosExpression,
    adapt: cosmosAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("cosmos", url),
  },
  reddit: {
    buildExpression: redditExpression,
    adapt: redditAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("reddit", url),
  },
  threads: {
    buildExpression: threadsExpression,
    adapt: threadsAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("threads", url),
  },
  github: {
    buildExpression: githubExpression,
    adapt: githubAdapt,
    sourceIdFromUrl: (url) =>
      sourceIdFromUrl("github", url)?.toLowerCase() ?? null,
  },
  substack: {
    buildExpression: substackExpression,
    adapt: substackAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("substack", url),
  },
  tumblr: {
    buildExpression: tumblrExpression,
    adapt: tumblrAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("tumblr", url),
  },
  savee: {
    buildExpression: saveeExpression,
    adapt: saveeAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("savee", url),
  },
  behance: {
    buildExpression: behanceExpression,
    adapt: behanceAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("behance", url),
  },
  vimeo: {
    buildExpression: vimeoExpression,
    adapt: vimeoAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("vimeo", url),
  },
  dribbble: {
    buildExpression: dribbbleExpression,
    adapt: dribbbleAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("dribbble", url),
  },
  unsplash: {
    buildExpression: unsplashExpression,
    adapt: unsplashAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("unsplash", url),
  },
  bluesky: {
    buildExpression: blueskyExpression,
    adapt: blueskyAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("bluesky", url),
  },
  marked: {
    buildExpression: markedExpression,
    adapt: markedAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("marked", url),
  },
  linkedin: {
    buildExpression: linkedinExpression,
    adapt: linkedinAdapt,
    sourceIdFromUrl: (url) => sourceIdFromUrl("linkedin", url),
  },
  mymind: {
    buildExpression: () => {
      throw new Error("mymind cards are imported through the API");
    },
    adapt: () => null,
    sourceIdFromUrl: () => null,
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
