import { isLowDetailHash } from "../../../lib/fingerprint/dhash";
import { HammingIndex } from "../../../lib/fingerprint/hamming-index";
import {
  compareVideoPrints,
  decodeVideoPrint,
  VIDEO_PRINT_ALGORITHM,
  VIDEO_PRINT_VERSION,
} from "../../../lib/fingerprint/video-print";
import type { VideoPrint } from "../../../lib/fingerprint/video-print";
import { assetRef } from "../types";
import type { Found, LibrarySave } from "../types";
import { assetsBySha, expandShaMatch } from "./expand";

const ALGORITHM = `${VIDEO_PRINT_ALGORITHM}@${VIDEO_PRINT_VERSION}`;
/** Re-encoded frames land within a few bits, so a pair is only aligned once one frame of each is that close. */
const CANDIDATE_DISTANCE = 4;
const QUERY_FRAMES = 24;

function detailedFrames(print: VideoPrint): Array<bigint> {
  return print.frames.filter((frame) => !isLowDetailHash(frame));
}

/** Sorted by duration, so each candidate after a video is the same length or longer. */
function candidates(
  prints: ReadonlyArray<VideoPrint>,
): Array<[number, number]> {
  const index = new HammingIndex<number>();
  for (const [position, print] of prints.entries()) {
    for (const frame of detailedFrames(print)) {
      index.add(frame, position);
    }
  }
  const pairs: Array<[number, number]> = [];
  for (const [position, print] of prints.entries()) {
    const frames = detailedFrames(print);
    const step = Math.max(1, Math.floor(frames.length / QUERY_FRAMES));
    const others = new Set<number>();
    for (let frame = 0; frame < frames.length; frame += step) {
      for (const hit of index.search(frames[frame] ?? 0n, CANDIDATE_DISTANCE)) {
        if (hit.value > position) {
          others.add(hit.value);
        }
      }
    }
    for (const other of [...others].sort((a, b) => a - b)) {
      pairs.push([position, other]);
    }
  }
  return pairs;
}

export function videoMatches(
  saves: ReadonlyArray<LibrarySave>,
  prints: ReadonlyMap<string, Uint8Array>,
): Array<Found> {
  const bySha = assetsBySha(
    saves,
    (asset) => asset.media === "video" && prints.has(asset.sha256),
  );
  const decoded: Array<{ sha256: string; print: VideoPrint }> = [];
  for (const sha256 of bySha.keys()) {
    const value = prints.get(sha256);
    const print = value ? decodeVideoPrint(value) : null;
    if (print) {
      decoded.push({ sha256, print });
    }
  }
  decoded.sort(
    (left, right) => left.print.durationSeconds - right.print.durationSeconds,
  );

  const found: Array<Found> = [];
  for (const [from, to] of candidates(decoded.map((entry) => entry.print))) {
    const left = decoded[from];
    const right = decoded[to];
    if (!left || !right) {
      continue;
    }
    const match = compareVideoPrints(left.print, right.print);
    if (!match) {
      continue;
    }
    found.push(
      ...expandShaMatch(
        bySha.get(left.sha256) ?? [],
        bySha.get(right.sha256) ?? [],
        (a, b) => ({
          matcher: "video",
          algorithm: ALGORITHM,
          matchedFrames: match.matchedFrames,
          comparedFrames: match.comparedFrames,
          offsetSeconds: match.offsetSeconds,
          left: assetRef(a),
          right: assetRef(b),
        }),
      ),
    );
  }
  return found;
}
