import type {
  AssetEvidence,
  DuplicatePair,
  DuplicateRelation,
  SaveEvidence,
} from "../../../shared/duplicate-contracts";
import { type Found, pairKey } from "./types";

function evidenceStrength(evidence: AssetEvidence): number {
  switch (evidence.matcher) {
    case "sha256":
      return 0;
    case "image":
      return evidence.distance / 64;
    case "video":
      return 1 - evidence.matchedFrames / evidence.comparedFrames;
    case "audio":
      return evidence.bitErrorRate;
  }
}

function saveEvidenceKey(evidence: SaveEvidence): string {
  switch (evidence.matcher) {
    case "manifest":
      return "manifest";
    case "source":
      return `source:${evidence.source}:${evidence.sourceId}`;
    case "url":
      return `url:${evidence.url}`;
    case "semantic":
      return "semantic";
  }
}

function mergeSaveEvidence(list: SaveEvidence[], next: SaveEvidence): void {
  const key = saveEvidenceKey(next);
  const index = list.findIndex((item) => saveEvidenceKey(item) === key);
  if (index < 0) {
    list.push(next);
    return;
  }
  const current = list[index];
  if (
    current?.matcher === "semantic" &&
    next.matcher === "semantic" &&
    next.distance < current.distance
  )
    list[index] = next;
}

function relationFor(
  saveEvidence: readonly SaveEvidence[],
  matched: number,
  coverage: DuplicatePair["coverage"],
): DuplicateRelation | null {
  if (
    saveEvidence.some(
      (item) =>
        item.matcher === "manifest" ||
        item.matcher === "source" ||
        item.matcher === "url",
    )
  )
    return "exact";
  if (
    matched > 0 &&
    coverage.left === coverage.leftTotal &&
    coverage.right === coverage.rightTotal
  )
    return "near";
  if (matched > 0) return "overlap";
  if (saveEvidence.some((item) => item.matcher === "semantic"))
    return "related";
  return null;
}

interface Bucket {
  ids: [string, string];
  saveEvidence: SaveEvidence[];
  primary: AssetEvidence[];
  supporting: AssetEvidence[];
}

/** Folds every piece of evidence into one pair per two Saves, matching each file at most once on each side. */
export function buildPairs(
  found: readonly Found[],
  assetCounts: ReadonlyMap<string, number>,
): DuplicatePair[] {
  const buckets = new Map<string, Bucket>();
  for (const item of found) {
    const key = pairKey(item.ids[0], item.ids[1]);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { ids: item.ids, saveEvidence: [], primary: [], supporting: [] };
      buckets.set(key, bucket);
    }
    if (item.save) mergeSaveEvidence(bucket.saveEvidence, item.save);
    if (item.asset)
      (item.supporting ? bucket.supporting : bucket.primary).push(item.asset);
  }

  const pairs: DuplicatePair[] = [];
  for (const bucket of buckets.values()) {
    const ordered = bucket.primary.toSorted(
      (left, right) =>
        evidenceStrength(left) - evidenceStrength(right) ||
        left.left.path.localeCompare(right.left.path) ||
        left.right.path.localeCompare(right.right.path),
    );
    const usedLeft = new Set<string>();
    const usedRight = new Set<string>();
    const assigned: AssetEvidence[] = [];
    for (const evidence of ordered) {
      if (
        usedLeft.has(evidence.left.path) ||
        usedRight.has(evidence.right.path)
      )
        continue;
      usedLeft.add(evidence.left.path);
      usedRight.add(evidence.right.path);
      assigned.push(evidence);
    }
    const matchedFiles = new Set(
      assigned.map((item) => `${item.left.path}\u0000${item.right.path}`),
    );
    const supporting = bucket.supporting.filter((item) =>
      matchedFiles.has(`${item.left.path}\u0000${item.right.path}`),
    );
    const coverage = {
      left: usedLeft.size,
      leftTotal: assetCounts.get(bucket.ids[0]) ?? 0,
      right: usedRight.size,
      rightTotal: assetCounts.get(bucket.ids[1]) ?? 0,
    };
    const relation = relationFor(
      bucket.saveEvidence,
      assigned.length,
      coverage,
    );
    if (!relation) continue;
    pairs.push({
      ids: bucket.ids,
      relation,
      saveEvidence: bucket.saveEvidence,
      assetEvidence: [...assigned, ...supporting],
      coverage,
    });
  }
  return pairs;
}
