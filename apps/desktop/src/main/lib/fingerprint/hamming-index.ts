import { popcount32 } from "./bits";

const CHUNKS = 4;
const CHUNK_BITS = 16;
const LOW_32 = 0xffffffffn;

interface Entry<T> {
  low: number;
  high: number;
  value: T;
}

function halves(hash: bigint) {
  return { low: Number(hash & LOW_32), high: Number((hash >> 32n) & LOW_32) };
}

function chunkOf(low: number, high: number, chunk: number): number {
  const word = chunk < 2 ? low : high;
  return (chunk % 2 === 0 ? word : word >>> CHUNK_BITS) & 0xffff;
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
  /** Hashes are kept as 32-bit halves because bigint math dominates the scan of a large Library. */
  readonly #entries: Array<Entry<T>> = [];
  readonly #seen: number[] = [];
  #searches = 0;

  add(hash: bigint, value: T): void {
    const id = this.#entries.length;
    const { low, high } = halves(hash);
    this.#entries.push({ low, high, value });
    this.#seen.push(0);
    for (const [chunk, bucket] of this.#buckets.entries()) {
      const key = chunkOf(low, high, chunk);
      const ids = bucket.get(key);
      if (ids) ids.push(id);
      else bucket.set(key, [id]);
    }
  }

  search(hash: bigint, radius: number): Array<{ value: T; distance: number }> {
    const flips = Math.floor(radius / CHUNKS);
    const { low, high } = halves(hash);
    this.#searches += 1;
    const stamp = this.#searches;
    const found: Array<{ value: T; distance: number }> = [];
    for (const [chunk, bucket] of this.#buckets.entries()) {
      for (const key of nearbyKeys(chunkOf(low, high, chunk), flips)) {
        for (const id of bucket.get(key) ?? []) {
          const entry = this.#entries[id];
          if (!entry || this.#seen[id] === stamp) continue;
          this.#seen[id] = stamp;
          const distance =
            popcount32(entry.low ^ low) + popcount32(entry.high ^ high);
          if (distance <= radius) found.push({ value: entry.value, distance });
        }
      }
    }
    return found;
  }
}
