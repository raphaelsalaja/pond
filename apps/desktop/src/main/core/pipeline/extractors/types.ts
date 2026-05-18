import type { Source } from "@pond/schema/db";
import type { Capture, CaptureMedia } from "@pond/schema/raw";

// The persisted shapes live in `@pond/schema/raw`. The pipeline used
// to redeclare `Capture`/`CaptureMedia`/`CaptureMetrics`/`RawJson`
// here, which let them silently drift out of sync with the schema
// (e.g. `CaptureMetrics` lost the new metric keys). Re-export the
// canonical types so there is exactly one definition.
export type {
  Capture,
  CaptureAuthor,
  CaptureMedia,
  CaptureMetrics,
  CaptureUpstream,
  RawJson,
} from "@pond/schema/raw";

// Historic alias — extractors still import `MediaCandidate` from this
// module. `CaptureMedia` IS the same shape (both use
// `"image" | "video" | "link"` for `type`), so keep the alias for
// backward compatibility instead of churning every extractor file.
export type MediaCandidate = CaptureMedia;

export interface ExtractInput {
  url: URL;
  fetch?: typeof fetch;
}

export interface Extractor {
  readonly id: string;
  readonly source: Source;
  readonly validUrl: readonly RegExp[];
  suitable(url: URL): boolean;
  extract(input: ExtractInput): Promise<Capture>;
}
