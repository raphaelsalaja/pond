import { fetchPinterestCapture } from "../../../refresh/harvest/pinterest/api";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, PINTEREST_PATTERNS } from "../url-patterns";

// Thin wrapper over `fetchPinterestCapture`. The Pinterest adapter
// scrapes the Relay payload (full title, creator avatar, full-res
// image, metrics) and produces a `Capture` directly.
export class PinterestPinExtractor implements Extractor {
  readonly id = "pinterest-pin";
  readonly source = "pinterest" as const;
  readonly validUrl = PINTEREST_PATTERNS;

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const pinId = match?.[1] ?? null;
    if (!pinId) throw new TerminalError("could not parse pinterest id");

    const result = await fetchPinterestCapture({ sourceId: pinId });
    if (!result.ok)
      throw new TerminalError(`pinterest relay: ${result.reason}`);
    return result.capture;
  }
}
