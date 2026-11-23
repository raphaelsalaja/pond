import type { Source } from "@pond/schema/db";
import type {
  AssetEvidence,
  AssetRef,
  SaveEvidence,
} from "../../../shared/duplicate-contracts";

export type AssetMedia = "image" | "video" | "audio";

export interface LibraryAsset extends AssetRef {
  media: AssetMedia | null;
}

export interface LibrarySave {
  id: string;
  source: Source;
  sourceId: string;
  url: string;
  captureUrl: string | null;
  /** Set on Saves made by splitting a post, which share the post's URL without being the same Save. */
  splitSourceId: string | null;
  /** Original files only. Thumbnails, posters and other generated files never count. */
  assets: LibraryAsset[];
  clip: number[] | null;
}

/** One piece of evidence for a pair. `supporting` evidence never counts toward coverage. */
export interface Found {
  ids: [string, string];
  save?: SaveEvidence;
  asset?: AssetEvidence;
  supporting?: boolean;
}

export interface FingerprintSets {
  image: ReadonlyMap<string, Uint8Array>;
  video: ReadonlyMap<string, Uint8Array>;
  audio: ReadonlyMap<string, Uint8Array>;
}

/** A hash shared by thousands of Saves (a blank page, a common icon) would otherwise produce millions of pairs. */
export const MAX_FANOUT = 64;

export function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

export function orderIds(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export function assetRef(asset: LibraryAsset): AssetRef {
  return {
    saveId: asset.saveId,
    path: asset.path,
    kind: asset.kind,
    size: asset.size,
    sha256: asset.sha256,
  };
}

/** Orients asset evidence so `left` belongs to the first id of the ordered pair. */
export function assetFound(
  evidence: AssetEvidence,
  supporting = false,
): Found | null {
  if (evidence.left.saveId === evidence.right.saveId) return null;
  const flipped = evidence.left.saveId > evidence.right.saveId;
  const oriented = flipped
    ? { ...evidence, left: evidence.right, right: evidence.left }
    : evidence;
  if (flipped && "offsetSeconds" in oriented)
    oriented.offsetSeconds = -oriented.offsetSeconds;
  return {
    ids: [oriented.left.saveId, oriented.right.saveId],
    asset: oriented,
    ...(supporting ? { supporting } : {}),
  };
}

/** Every pair among the first `limit` ids, then each remaining id paired with the first. */
export function fanoutPairs(
  ids: readonly string[],
  limit = MAX_FANOUT,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const head = ids.slice(0, limit);
  for (let left = 0; left < head.length; left++)
    for (let right = left + 1; right < head.length; right++)
      pairs.push(orderIds(head[left] as string, head[right] as string));
  const anchor = ids[0];
  if (anchor)
    for (const id of ids.slice(limit)) pairs.push(orderIds(anchor, id));
  return pairs;
}
