import type Database from "better-sqlite3";
import type {
  DuplicateDismissal,
  DuplicateScan,
} from "../../../shared/duplicate-contracts";
import { mediaEmbeddingVersion } from "../../../shared/embeddings";
import { knnVec } from "../vec-index";
import { matchLibrary } from "./engine";
import { fingerprintIndexStatus, loadFingerprints } from "./fingerprints";
import { loadLibrarySaves } from "./library";
import type { ClassifyUrl } from "./matchers/source";

export {
  classifyPendingAssets,
  findAssetsBySha256,
  rebuildAssetIndex,
} from "./asset-index";
export { fingerprintIndexStatus } from "./fingerprints";

export interface ScanOptions {
  ids?: readonly string[];
  dismissed?: readonly DuplicateDismissal[];
  classifyUrl: ClassifyUrl;
  semantic?: boolean;
}

export function scanDuplicatesIn(
  sqlite: Database.Database,
  options: ScanOptions,
): DuplicateScan {
  const model = options.semantic === false ? null : mediaEmbeddingVersion();
  const saves = loadLibrarySaves(sqlite, model);
  const scope = options.ids?.length ? new Set(options.ids) : undefined;
  const { pairs, groups } = matchLibrary(saves, {
    classifyUrl: options.classifyUrl,
    fingerprints: loadFingerprints(sqlite),
    semantic: model
      ? {
          model,
          store: {
            neighbors: (vector, limit) => knnVec(sqlite, "clip", vector, limit),
          },
        }
      : undefined,
    scope,
    dismissed: options.dismissed,
  });
  return { pairs, groups, index: fingerprintIndexStatus(sqlite) };
}

/** Re-derives each URL's source identity the same way capture does, so two captures of one post meet. */
export async function defaultClassifyUrl(): Promise<ClassifyUrl> {
  const [{ normalizeUrl }, { classifyUrlToSource }, { sourceIdFromUrl }] =
    await Promise.all([
      import("../pipeline/enqueue-input"),
      import("../pipeline/extractors"),
      import("../pipeline/url"),
    ]);
  return (raw) => {
    const url = normalizeUrl(raw);
    const { source } = classifyUrlToSource(url);
    if (!source) return null;
    const sourceId = sourceIdFromUrl(source, url);
    return sourceId ? { source, sourceId } : null;
  };
}

export async function scanDuplicates(input: {
  ids?: readonly string[];
}): Promise<DuplicateScan> {
  const [{ getDb }, { readDismissals }] = await Promise.all([
    import("../../db"),
    import("./dismissals"),
  ]);
  const db = await getDb();
  return scanDuplicatesIn(db.$raw, {
    ids: input.ids,
    dismissed: readDismissals(),
    classifyUrl: await defaultClassifyUrl(),
  });
}
