//! Ports of `apps/desktop/src/main/lib/fingerprint`. Each function follows the
//! TypeScript line for line, including float evaluation order, so encoded prints
//! compare byte for byte with the ones already stored in a Library.

pub mod audio;
pub mod dhash;
pub mod fft;
pub mod hamming;
pub mod image;
pub mod video;

/// Re-encodes and trims shift a file's length by a few frames, never by much more.
pub fn durations_close(left: f64, right: f64) -> bool {
    (left - right).abs() <= f64::max(1.5, f64::max(left, right) * 0.03)
}

pub(crate) fn read_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

pub(crate) fn read_u64(bytes: &[u8], at: usize) -> u64 {
    let mut word = [0u8; 8];
    word.copy_from_slice(&bytes[at..at + 8]);
    u64::from_be_bytes(word)
}

pub(crate) fn read_f64(bytes: &[u8], at: usize) -> f64 {
    f64::from_bits(read_u64(bytes, at))
}

/// False for NaN as well, like the TypeScript `!(value > 0)` guards on decoded headers.
pub(crate) fn is_positive(value: f64) -> bool {
    value > 0.0
}
