import {
  AUDIO_PRINT_ALGORITHM,
  AUDIO_PRINT_VERSION,
  compareAudioPrints,
  decodeAudioPrint,
} from "../../../lib/fingerprint/audio-print";
import type { AudioPrint } from "../../../lib/fingerprint/audio-print";
import { assetRef } from "../types";
import type { Found, LibrarySave } from "../types";
import { assetsBySha, expandShaMatch } from "./expand";

const ALGORITHM = `${AUDIO_PRINT_ALGORITHM}@${AUDIO_PRINT_VERSION}`;
/** About the first thirty seconds of each print, which is enough to find a copy and keeps the lookup small. */
const INDEX_FRAMES = 1300;
const INDEX_STRIDE = 2;
/** A sub-fingerprint shared by this many files is silence or a steady tone and says nothing about identity. */
const MAX_BUCKET = 64;
const MIN_VOTES = 2;

/** Copies share sub-fingerprints that match exactly or one bit off, so only files with a few of those are slid over each other. */
function candidates(
  prints: ReadonlyArray<AudioPrint>,
): Array<[number, number]> {
  const lookup = new Map<number, Array<number>>();
  for (const [position, print] of prints.entries()) {
    const end = Math.min(print.frames.length, INDEX_FRAMES);
    for (let frame = 0; frame < end; frame += INDEX_STRIDE) {
      const value = print.frames[frame] ?? 0;
      const list = lookup.get(value);
      if (!list) {
        lookup.set(value, [position]);
      } else if (list.length <= MAX_BUCKET && list.at(-1) !== position) {
        list.push(position);
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  for (const [position, print] of prints.entries()) {
    const votes = new Map<number, number>();
    const end = Math.min(print.frames.length, INDEX_FRAMES);
    for (let frame = 0; frame < end; frame++) {
      const value = print.frames[frame] ?? 0;
      for (let bit = -1; bit < 32; bit++) {
        const probe = bit < 0 ? value : (value ^ (1 << bit)) >>> 0;
        const list = lookup.get(probe);
        if (!list || list.length > MAX_BUCKET) {
          continue;
        }
        for (const other of list) {
          if (other > position) {
            votes.set(other, (votes.get(other) ?? 0) + 1);
          }
        }
      }
    }
    for (const [other, count] of [...votes].sort((a, b) => a[0] - b[0])) {
      if (count >= MIN_VOTES) {
        pairs.push([position, other]);
      }
    }
  }
  return pairs;
}

/** A shared soundtrack does not make two videos the same, so audio between two videos only supports a frame match. */
export function audioMatches(
  saves: ReadonlyArray<LibrarySave>,
  prints: ReadonlyMap<string, Uint8Array>,
): Array<Found> {
  const bySha = assetsBySha(
    saves,
    (asset) =>
      (asset.media === "audio" || asset.media === "video") &&
      prints.has(asset.sha256),
  );
  const decoded: Array<{ sha256: string; print: AudioPrint }> = [];
  for (const sha256 of bySha.keys()) {
    const value = prints.get(sha256);
    const print = value ? decodeAudioPrint(value) : null;
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
    const match = compareAudioPrints(left.print, right.print);
    if (!match) {
      continue;
    }
    found.push(
      ...expandShaMatch(
        bySha.get(left.sha256) ?? [],
        bySha.get(right.sha256) ?? [],
        (a, b) => ({
          matcher: "audio",
          algorithm: ALGORITHM,
          bitErrorRate: match.bitErrorRate,
          offsetSeconds: match.offsetSeconds,
          left: assetRef(a),
          right: assetRef(b),
        }),
        (a, b) => a.media === "video" && b.media === "video",
      ),
    );
  }
  return found;
}
