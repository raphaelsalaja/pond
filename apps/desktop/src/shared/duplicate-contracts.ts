import type { Source } from "@pond/schema/db";

/** How two Saves relate. Only `exact` and `near` describe the same content; `overlap` shares files and `related` shares meaning. */
export type DuplicateRelation = "exact" | "near" | "overlap" | "related";

export const DUPLICATE_RELATIONS = [
  "exact",
  "near",
  "overlap",
  "related",
] as const satisfies readonly DuplicateRelation[];

export function relationRank(relation: DuplicateRelation): number {
  return DUPLICATE_RELATIONS.indexOf(relation);
}

export function isMergeableRelation(relation: DuplicateRelation): boolean {
  return relation === "exact" || relation === "near";
}

/** One original file of a Save. `path` is unique within the Save's folder. */
export interface AssetRef {
  saveId: string;
  path: string;
  kind: string;
  size: number;
  sha256: string;
}

export type AssetEvidence =
  | { matcher: "sha256"; left: AssetRef; right: AssetRef }
  | {
      matcher: "image";
      algorithm: string;
      distance: number;
      left: AssetRef;
      right: AssetRef;
    }
  | {
      matcher: "video";
      algorithm: string;
      matchedFrames: number;
      comparedFrames: number;
      offsetSeconds: number;
      left: AssetRef;
      right: AssetRef;
    }
  | {
      matcher: "audio";
      algorithm: string;
      bitErrorRate: number;
      offsetSeconds: number;
      left: AssetRef;
      right: AssetRef;
    };

export type SaveEvidence =
  | { matcher: "manifest"; files: number }
  | { matcher: "source"; source: Source; sourceId: string }
  | { matcher: "url"; url: string }
  | { matcher: "semantic"; model: string; distance: number };

export interface DuplicateCoverage {
  left: number;
  leftTotal: number;
  right: number;
  rightTotal: number;
}

export interface DuplicatePair {
  ids: [string, string];
  relation: DuplicateRelation;
  saveEvidence: SaveEvidence[];
  assetEvidence: AssetEvidence[];
  coverage: DuplicateCoverage;
}

export interface DuplicateGroup {
  relation: DuplicateRelation;
  ids: string[];
  /** Positions in `DuplicateScan.pairs` for the pairs among this group's Saves. */
  pairs: number[];
}

export interface DuplicateIndexStatus {
  assets: number;
  fingerprinted: number;
  pending: number;
  failed: number;
}

export interface DuplicateScan {
  pairs: DuplicatePair[];
  groups: DuplicateGroup[];
  index: DuplicateIndexStatus;
}

export interface DuplicateDismissal {
  ids: [string, string];
  relation: DuplicateRelation;
}

const NEAR_COPY = {
  image: "Same Image, Resized",
  video: "Same Video",
  audio: "Same Audio",
} as const;

function sharedFiles(count: number): string {
  return count === 1 ? "Shares 1 File" : `Shares ${count} Files`;
}

/** One short line saying why two Saves were paired, in the words Duplicate Review shows. */
export function describeDuplicate(pair: DuplicatePair): string {
  const matchers = new Set(pair.saveEvidence.map((item) => item.matcher));
  if (pair.relation === "exact") {
    if (matchers.has("manifest"))
      return pair.coverage.leftTotal === 1 ? "Same File" : "Same Files";
    if (matchers.has("source")) return "Same Post";
    if (matchers.has("url")) return "Same Link";
    return "Same Files";
  }
  if (pair.relation === "overlap")
    return sharedFiles(Math.min(pair.coverage.left, pair.coverage.right));
  if (pair.relation === "related") return "Similar Content";
  const kinds = new Set(
    pair.assetEvidence.flatMap((item) =>
      item.matcher === "sha256" ? [] : [item.matcher],
    ),
  );
  /** A soundtrack only ever supports a video match, so it doesn't change what the pair is. */
  if (kinds.has("video")) kinds.delete("audio");
  if (kinds.size === 1) {
    const [kind] = kinds;
    if (kind) return NEAR_COPY[kind];
  }
  return "Same Content, Re-Encoded";
}

export function describeDuplicateGroup(
  group: DuplicateGroup,
  pairs: readonly DuplicatePair[],
): string {
  const lines = new Set(
    group.pairs.flatMap((index) => {
      const pair = pairs[index];
      return pair && pair.relation === group.relation
        ? [describeDuplicate(pair)]
        : [];
    }),
  );
  const [only] = lines;
  if (lines.size === 1 && only) return only;
  return group.relation === "exact" ? "Same Files" : "Same Content";
}
