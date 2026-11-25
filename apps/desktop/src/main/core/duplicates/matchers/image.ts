import { isLowDetailHash } from "../../../lib/fingerprint/dhash";
import { HammingIndex } from "../../../lib/fingerprint/hamming-index";
import {
  decodeImagePrint,
  IMAGE_PRINT_ALGORITHM,
  IMAGE_PRINT_VERSION,
} from "../../../lib/fingerprint/image-print";
import { assetRef, pairKey } from "../types";
import type { Found, LibrarySave } from "../types";
import { assetsBySha, expandShaMatch } from "./expand";

/** Center hashes of unrelated images collide more often than full hashes, so a crop match needs a tighter bound. */
export const IMAGE_FULL_DISTANCE = 6;
export const IMAGE_CENTER_DISTANCE = 4;

const ALGORITHM = `${IMAGE_PRINT_ALGORITHM}@${IMAGE_PRINT_VERSION}`;

interface Entry {
  sha256: string;
  center: boolean;
}

export function imageMatches(
  saves: ReadonlyArray<LibrarySave>,
  prints: ReadonlyMap<string, Uint8Array>,
): Array<Found> {
  const bySha = assetsBySha(
    saves,
    (asset) => asset.media === "image" && prints.has(asset.sha256),
  );
  const index = new HammingIndex<Entry>();
  const decoded = new Map<string, { full: bigint; center: bigint }>();
  for (const sha256 of bySha.keys()) {
    const value = prints.get(sha256);
    const print = value ? decodeImagePrint(value) : null;
    if (!print || isLowDetailHash(print.full)) continue;
    decoded.set(sha256, print);
    index.add(print.full, { sha256, center: false });
    if (!isLowDetailHash(print.center)) {
      index.add(print.center, { sha256, center: true });
    }
  }

  const best = new Map<
    string,
    { left: string; right: string; distance: number }
  >();
  const consider = (left: string, right: string, distance: number) => {
    if (left === right) return;
    const key = pairKey(left, right);
    const current = best.get(key);
    if (!current || distance < current.distance) {
      best.set(key, { left, right, distance });
    }
  };
  for (const [sha256, print] of decoded) {
    for (const hit of index.search(print.full, IMAGE_FULL_DISTANCE)) {
      if (hit.value.center && hit.distance > IMAGE_CENTER_DISTANCE) continue;
      consider(sha256, hit.value.sha256, hit.distance);
    }
    if (isLowDetailHash(print.center)) {
      continue;
    }
    for (const hit of index.search(print.center, IMAGE_CENTER_DISTANCE)) {
      consider(sha256, hit.value.sha256, hit.distance);
    }
  }

  const found: Array<Found> = [];
  for (const { left, right, distance } of best.values()) {
    found.push(
      ...expandShaMatch(
        bySha.get(left) ?? [],
        bySha.get(right) ?? [],
        (a, b) => ({
          matcher: "image",
          algorithm: ALGORITHM,
          distance,
          left: assetRef(a),
          right: assetRef(b),
        }),
      ),
    );
  }
  return found;
}
