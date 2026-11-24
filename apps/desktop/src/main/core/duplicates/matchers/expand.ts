import type { AssetEvidence } from "../../../../shared/duplicate-contracts";
import { assetFound, MAX_FANOUT } from "../types";
import type { Found, LibraryAsset, LibrarySave } from "../types";
import { isSha256 } from "./sha256";

/** Perceptual matchers compare each distinct file once, then fan the match out to every Save that holds it. */
export function assetsBySha(
  saves: ReadonlyArray<LibrarySave>,
  include: (asset: LibraryAsset) => boolean,
): Map<string, Array<LibraryAsset>> {
  const bySha = new Map<string, Array<LibraryAsset>>();
  for (const save of saves) {
    for (const asset of save.assets) {
      if (!isSha256(asset.sha256) || !include(asset)) {
        continue;
      }
      const list = bySha.get(asset.sha256);
      if (list) {
        list.push(asset);
      } else {
        bySha.set(asset.sha256, [asset]);
      }
    }
  }
  return bySha;
}

export function expandShaMatch(
  left: ReadonlyArray<LibraryAsset>,
  right: ReadonlyArray<LibraryAsset>,
  evidence: (left: LibraryAsset, right: LibraryAsset) => AssetEvidence,
  supporting?: (left: LibraryAsset, right: LibraryAsset) => boolean,
): Array<Found> {
  const found: Array<Found> = [];
  for (const a of left.slice(0, MAX_FANOUT)) {
    for (const b of right.slice(0, MAX_FANOUT)) {
      const match = assetFound(evidence(a, b), supporting?.(a, b) ?? false);
      if (match) {
        found.push(match);
      }
    }
  }
  return found;
}
