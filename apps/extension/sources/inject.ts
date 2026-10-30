import type { ExternalSource } from "@pond/schema/sources";
import { inject as arena } from "./arena/inject";
import { inject as cosmos } from "./cosmos/inject";
import { inject as github } from "./github/inject";
import { inject as instagram } from "./instagram/inject";
import { inject as pinterest } from "./pinterest/inject";
import { inject as reddit } from "./reddit/inject";
import { inject as substack } from "./substack/inject";
import { inject as threads } from "./threads/inject";
import { inject as tiktok } from "./tiktok/inject";
import { inject as twitter } from "./twitter/inject";
import { inject as youtube } from "./youtube/inject";

/** MAIN-world hooks; importing this from an isolated script would patch the wrong `fetch`. Sources without live hooks are null. */
export const INJECTORS = {
  twitter,
  instagram,
  pinterest,
  arena,
  cosmos,
  tiktok,
  youtube,
  reddit,
  threads,
  github,
  substack,
  tumblr: null,
  savee: null,
  behance: null,
  vimeo: null,
  dribbble: null,
  unsplash: null,
  bluesky: null,
  marked: null,
} satisfies Record<ExternalSource, (() => void) | null>;
