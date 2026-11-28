use super::fft::Fft;
use super::{durations_close, is_positive, read_f64, read_u32};
use std::f64::consts::PI;

pub const AUDIO_PRINT_ALGORITHM: &str = "audio-print@1";
pub const AUDIO_PRINT_SAMPLE_RATE: f64 = 5512.0;
const FRAME_SIZE: usize = 2048;
const HOP: usize = 128;
const BANDS: usize = 33;
const LOW_HZ: f64 = 300.0;
const HIGH_HZ: f64 = 2000.0;
const HEADER_BYTES: usize = 20;
const MAX_OFFSET_SECONDS: f64 = 2.0;
const MIN_OVERLAP_FRAMES: i64 = 256;
const NEAR_BIT_ERROR_RATE: f64 = 0.3;

pub struct AudioPrint {
    pub duration_seconds: f64,
    pub hop_seconds: f64,
    pub frames: Vec<u32>,
}

/// `Math.round` for the non-negative values used here.
fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}

fn band_edges() -> [usize; BANDS + 1] {
    let mut edges = [0usize; BANDS + 1];
    for (band, edge) in edges.iter_mut().enumerate() {
        let hz = LOW_HZ * (HIGH_HZ / LOW_HZ).powf(band as f64 / BANDS as f64);
        *edge = js_round((hz * FRAME_SIZE as f64) / AUDIO_PRINT_SAMPLE_RATE) as usize;
    }
    edges
}

fn hann() -> Vec<f64> {
    (0..FRAME_SIZE)
        .map(|index| 0.5 - 0.5 * ((2.0 * PI * index as f64) / FRAME_SIZE as f64).cos())
        .collect()
}

/// Haitsma–Kalker sub-fingerprints: each bit is the sign of the band-energy
/// difference across neighbouring bands and frames.
pub fn audio_print_from_samples(samples: &[f32], duration_seconds: f64) -> AudioPrint {
    let edges = band_edges();
    let taper = hann();
    let fft = Fft::new(FRAME_SIZE);
    let mut real = vec![0f64; FRAME_SIZE];
    let mut imag = vec![0f64; FRAME_SIZE];
    let frame_count = if samples.len() < FRAME_SIZE {
        0
    } else {
        (samples.len() - FRAME_SIZE) / HOP + 1
    };
    let mut frames = vec![0u32; frame_count.saturating_sub(1)];
    let mut previous: Option<[f64; BANDS]> = None;
    for frame in 0..frame_count {
        let start = frame * HOP;
        for index in 0..FRAME_SIZE {
            real[index] = samples.get(start + index).map_or(0.0, |v| *v as f64) * taper[index];
            imag[index] = 0.0;
        }
        fft.run(&mut real, &mut imag);
        let mut energy = [0f64; BANDS];
        for band in 0..BANDS {
            let mut sum = 0f64;
            let to = usize::max(edges[band] + 1, edges[band + 1]);
            for bin in edges[band]..to {
                let r = real[bin];
                let i = imag[bin];
                sum += r * r + i * i;
            }
            energy[band] = sum;
        }
        if let Some(previous) = previous {
            let mut bits = 0u32;
            for band in 0..BANDS - 1 {
                let now = energy[band] - energy[band + 1];
                let before = previous[band] - previous[band + 1];
                if now - before > 0.0 {
                    bits |= 1u32 << (31 - band);
                }
            }
            frames[frame - 1] = bits;
        }
        previous = Some(energy);
    }
    AudioPrint {
        duration_seconds,
        hop_seconds: HOP as f64 / AUDIO_PRINT_SAMPLE_RATE,
        frames,
    }
}

pub fn encode_audio_print(print: &AudioPrint) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER_BYTES + print.frames.len() * 4);
    bytes.extend_from_slice(&print.duration_seconds.to_be_bytes());
    bytes.extend_from_slice(&print.hop_seconds.to_be_bytes());
    bytes.extend_from_slice(&(print.frames.len() as u32).to_be_bytes());
    for frame in &print.frames {
        bytes.extend_from_slice(&frame.to_be_bytes());
    }
    bytes
}

pub fn decode_audio_print(bytes: &[u8]) -> Option<AudioPrint> {
    if bytes.len() < HEADER_BYTES {
        return None;
    }
    let count = read_u32(bytes, 16) as usize;
    if bytes.len() != HEADER_BYTES + count * 4 {
        return None;
    }
    let frames = (0..count)
        .map(|index| read_u32(bytes, HEADER_BYTES + index * 4))
        .collect();
    let duration_seconds = read_f64(bytes, 0);
    let hop_seconds = read_f64(bytes, 8);
    if !is_positive(duration_seconds) || !is_positive(hop_seconds) {
        return None;
    }
    Some(AudioPrint {
        duration_seconds,
        hop_seconds,
        frames,
    })
}

pub struct AudioMatch {
    pub bit_error_rate: f64,
    pub offset_seconds: f64,
}

/// Slides one print over the other within a couple of seconds and keeps the
/// lowest bit error rate.
pub fn compare_audio_prints(left: &AudioPrint, right: &AudioPrint) -> Option<AudioMatch> {
    if !durations_close(left.duration_seconds, right.duration_seconds) {
        return None;
    }
    if left.hop_seconds != right.hop_seconds {
        return None;
    }
    let max_shift = js_round(MAX_OFFSET_SECONDS / left.hop_seconds) as i64;
    let left_len = left.frames.len() as i64;
    let right_len = right.frames.len() as i64;
    let mut best: Option<AudioMatch> = None;
    for shift in -max_shift..=max_shift {
        let from = i64::max(0, -shift);
        let to = i64::min(left_len, right_len - shift);
        let overlap = to - from;
        if overlap < MIN_OVERLAP_FRAMES {
            continue;
        }
        let mut errors = 0u64;
        for index in from..to {
            errors += (left.frames[index as usize] ^ right.frames[(index + shift) as usize])
                .count_ones() as u64;
        }
        let bit_error_rate = errors as f64 / (overlap * 32) as f64;
        if best
            .as_ref()
            .is_none_or(|current| bit_error_rate < current.bit_error_rate)
        {
            best = Some(AudioMatch {
                bit_error_rate,
                offset_seconds: shift as f64 * left.hop_seconds,
            });
        }
    }
    best.filter(|current| current.bit_error_rate <= NEAR_BIT_ERROR_RATE)
}
