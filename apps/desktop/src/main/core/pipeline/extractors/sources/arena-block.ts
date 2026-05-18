import { fetchArenaCapture } from "../../../refresh/harvest/arena/api";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { ARENA_PATTERNS, firstMatch } from "../url-patterns";

// Thin wrapper over `fetchArenaCapture`. The Arena adapter hits the
// REST API and returns a fully-shaped `Capture`; this class just plugs
// it into the URL-first extractor registry.
export class ArenaBlockExtractor implements Extractor {
  readonly id = "arena-block";
  readonly source = "arena" as const;
  readonly validUrl = ARENA_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const blockId = match?.[1] ?? null;
    if (!blockId) throw new TerminalError("could not parse arena block id");

    const result = await fetchArenaCapture({ sourceId: blockId });
    if (!result.ok) throw new TerminalError(`arena api: ${result.reason}`);
    return result.capture;
  }
}
