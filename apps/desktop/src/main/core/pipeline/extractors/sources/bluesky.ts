import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { BLUESKY_PATTERNS } from "../url-patterns";

export class BlueskyPostExtractor implements Extractor {
  readonly id = "bluesky-post";
  readonly source = "bluesky" as const;
  readonly validUrl = BLUESKY_PATTERNS;
  /** You connect Bluesky by handle and every read is public, so no session cookie is ever imported. */
  readonly cookieDomain = null;

  authCookies(): boolean {
    return false;
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first, handle] = segments;
    if (segments.length !== 2 || first !== "profile" || !handle) {
      return null;
    }
    if (handle.startsWith("did:")) {
      return handle;
    }
    return /^[a-z0-9.-]{3,253}$/i.test(handle) ? handle.toLowerCase() : null;
  }

  readonly tests = [
    {
      url: "https://bsky.app/profile/bsky.app/post/3mxu3hsnebc2v",
      id: "3mxu3hsnebc2v",
      profile: { url: "https://bsky.app/profile/bsky.app", handle: "bsky.app" },
    },
    {
      url: "https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3mxu3hsnebc2v",
      id: "3mxu3hsnebc2v",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("bluesky", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse bluesky post");
    }
    return captureFromSource({
      url: input.url.href,
      source: "bluesky",
      sourceId,
    });
  }
}
