//! Port of `hamming-index.ts`. Hits come back in the same order as the
//! TypeScript (chunk, then nearby key, then insertion), because callers keep
//! the first of equally close matches.

use rustc_hash::FxHashMap as HashMap;

const CHUNKS: usize = 4;
const CHUNK_BITS: u32 = 16;

fn chunk_of(hash: u64, chunk: usize) -> u16 {
    (hash >> (16 * chunk)) as u16
}

fn nearby_keys(key: u16, flips: u32, from: u32, out: &mut Vec<u16>) {
    out.push(key);
    if flips == 0 {
        return;
    }
    for bit in from..CHUNK_BITS {
        nearby_keys(key ^ (1u16 << bit), flips - 1, bit + 1, out);
    }
}

pub struct Hit<'a, T> {
    pub value: &'a T,
    pub distance: u32,
}

/// Hashes within `radius` bits differ by at most `radius / 4` bits in one of
/// four 16-bit chunks, so a search only compares hashes near in some chunk.
pub struct HammingIndex<T> {
    buckets: [HashMap<u16, Vec<u32>>; CHUNKS],
    hashes: Vec<u64>,
    values: Vec<T>,
    seen: Vec<u32>,
    searches: u32,
}

impl<T> Default for HammingIndex<T> {
    fn default() -> Self {
        Self {
            buckets: Default::default(),
            hashes: Vec::new(),
            values: Vec::new(),
            seen: Vec::new(),
            searches: 0,
        }
    }
}

impl<T> HammingIndex<T> {
    pub fn add(&mut self, hash: u64, value: T) {
        let id = self.hashes.len() as u32;
        self.hashes.push(hash);
        self.values.push(value);
        self.seen.push(0);
        for (chunk, bucket) in self.buckets.iter_mut().enumerate() {
            bucket.entry(chunk_of(hash, chunk)).or_default().push(id);
        }
    }

    pub fn search(&mut self, hash: u64, radius: u32) -> Vec<Hit<'_, T>> {
        let flips = radius / CHUNKS as u32;
        self.searches += 1;
        let stamp = self.searches;
        let mut found = Vec::new();
        let mut keys = Vec::new();
        for chunk in 0..CHUNKS {
            keys.clear();
            nearby_keys(chunk_of(hash, chunk), flips, 0, &mut keys);
            for key in &keys {
                let Some(ids) = self.buckets[chunk].get(key) else {
                    continue;
                };
                for &id in ids {
                    let id = id as usize;
                    if self.seen[id] == stamp {
                        continue;
                    }
                    self.seen[id] = stamp;
                    let distance = (self.hashes[id] ^ hash).count_ones();
                    if distance <= radius {
                        found.push((id, distance));
                    }
                }
            }
        }
        found
            .into_iter()
            .map(|(id, distance)| Hit {
                value: &self.values[id],
                distance,
            })
            .collect()
    }
}
