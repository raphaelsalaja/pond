import { hamming64 } from "./bits";

const CHUNKS = 4;
const CHUNK_BITS = 16;
const CHUNK_MASK = 0xffffn;

function chunkOf(hash: bigint, chunk: number): number {
  return Number((hash >> BigInt(chunk * CHUNK_BITS)) & CHUNK_MASK);
}

function nearbyKeys(key: number, flips: number, from = 0): number[] {
  if (flips === 0) return [key];
  const keys = [key];
  for (let bit = from; bit < CHUNK_BITS; bit++)
    keys.push(...nearbyKeys(key ^ (1 << bit), flips - 1, bit + 1));
  return keys;
}

/** Hashes within `radius` bits differ by at most `radius / 4` bits in one of four 16-bit chunks, so a search only compares hashes near in some chunk. */
export class HammingIndex<T> {
  readonly #buckets: Array<Map<number, number[]>> = Array.from(
    { length: CHUNKS },
    () => new Map(),
  );
  readonly #entries: Array<{ hash: bigint; value: T }> = [];

  add(hash: bigint, value: T): void {
    const id = this.#entries.length;
    this.#entries.push({ hash, value });
    for (const [chunk, bucket] of this.#buckets.entries()) {
      const key = chunkOf(hash, chunk);
      const ids = bucket.get(key);
      if (ids) ids.push(id);
      else bucket.set(key, [id]);
    }
  }

  search(hash: bigint, radius: number): Array<{ value: T; distance: number }> {
    const flips = Math.floor(radius / CHUNKS);
    const seen = new Set<number>();
    const found: Array<{ value: T; distance: number }> = [];
    for (const [chunk, bucket] of this.#buckets.entries()) {
      for (const key of nearbyKeys(chunkOf(hash, chunk), flips)) {
        for (const id of bucket.get(key) ?? []) {
          const entry = this.#entries[id];
          if (!entry || seen.has(id)) continue;
          seen.add(id);
          const distance = hamming64(entry.hash, hash);
          if (distance <= radius) found.push({ value: entry.value, distance });
        }
      }
    }
    return found;
  }
}
