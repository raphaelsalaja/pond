use super::dhash::{dhash_from_gray, is_low_detail_hash, DHASH_HEIGHT, DHASH_WIDTH};
use super::{durations_close, is_positive, read_f64, read_u32, read_u64};

pub const VIDEO_PRINT_ALGORITHM: &str = "video-dhash-seq@1";
const HEADER_BYTES: usize = 20;
const FRAME_DISTANCE: u32 = 10;
const MIN_COMPARED_FRAMES: u32 = 5;
const NEAR_RATIO: f64 = 0.8;
const OFFSET_STEPS: i32 = 3;

pub struct VideoPrint {
    pub duration_seconds: f64,
    pub interval_seconds: f64,
    pub frames: Vec<u64>,
}

/// `frames` is every 9×8 greyscale frame, back to back.
pub fn video_print_from_frames(
    duration_seconds: f64,
    interval_seconds: f64,
    frames: &[u8],
) -> VideoPrint {
    VideoPrint {
        duration_seconds,
        interval_seconds,
        frames: frames
            .chunks(DHASH_WIDTH * DHASH_HEIGHT)
            .map(dhash_from_gray)
            .collect(),
    }
}

pub fn encode_video_print(print: &VideoPrint) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(HEADER_BYTES + print.frames.len() * 8);
    bytes.extend_from_slice(&print.duration_seconds.to_be_bytes());
    bytes.extend_from_slice(&print.interval_seconds.to_be_bytes());
    bytes.extend_from_slice(&(print.frames.len() as u32).to_be_bytes());
    for frame in &print.frames {
        bytes.extend_from_slice(&frame.to_be_bytes());
    }
    bytes
}

pub fn decode_video_print(bytes: &[u8]) -> Option<VideoPrint> {
    if bytes.len() < HEADER_BYTES {
        return None;
    }
    let count = read_u32(bytes, 16) as usize;
    if bytes.len() != HEADER_BYTES + count * 8 {
        return None;
    }
    let frames = (0..count)
        .map(|index| read_u64(bytes, HEADER_BYTES + index * 8))
        .collect();
    let duration_seconds = read_f64(bytes, 0);
    let interval_seconds = read_f64(bytes, 8);
    if !is_positive(duration_seconds) || !is_positive(interval_seconds) {
        return None;
    }
    Some(VideoPrint {
        duration_seconds,
        interval_seconds,
        frames,
    })
}

pub struct VideoMatch {
    pub matched_frames: u32,
    pub compared_frames: u32,
    pub offset_seconds: f64,
}

/// Aligns by timestamp, not frame index, and tries a few whole-interval shifts
/// for leading black frames or a trimmed intro.
pub fn compare_video_prints(left: &VideoPrint, right: &VideoPrint) -> Option<VideoMatch> {
    if !durations_close(left.duration_seconds, right.duration_seconds) {
        return None;
    }
    let mut best: Option<VideoMatch> = None;
    for step in -OFFSET_STEPS..=OFFSET_STEPS {
        let offset_seconds = step as f64 * left.interval_seconds;
        let mut matched_frames = 0u32;
        let mut compared_frames = 0u32;
        for (index, &a) in left.frames.iter().enumerate() {
            let time = (index as f64 + 0.5) * left.interval_seconds + offset_seconds;
            let other = (time / right.interval_seconds).floor();
            if other < 0.0 || other >= right.frames.len() as f64 {
                continue;
            }
            let b = right.frames[other as usize];
            if is_low_detail_hash(a) || is_low_detail_hash(b) {
                continue;
            }
            compared_frames += 1;
            if (a ^ b).count_ones() <= FRAME_DISTANCE {
                matched_frames += 1;
            }
        }
        if compared_frames < MIN_COMPARED_FRAMES {
            continue;
        }
        let ratio = matched_frames as f64 / compared_frames as f64;
        if best.as_ref().is_none_or(|current| {
            ratio > current.matched_frames as f64 / current.compared_frames as f64
        }) {
            best = Some(VideoMatch {
                matched_frames,
                compared_frames,
                offset_seconds,
            });
        }
    }
    best.filter(|current| {
        current.matched_frames as f64 / current.compared_frames as f64 >= NEAR_RATIO
    })
}
