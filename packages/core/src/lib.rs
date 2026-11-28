//! Pond's native core. A spike: the duplicate engine and media fingerprints,
//! checked against the TypeScript implementation they port.

pub mod duplicates;
pub mod fingerprint;

use fingerprint::{audio, image, video};
use napi::bindgen_prelude::{AsyncTask, Buffer, Float32Array};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;

fn run_match(input: &str) -> Result<String> {
    let parsed: duplicates::engine::MatchInput = serde_json::from_str(input)
        .map_err(|error| Error::from_reason(format!("Invalid input: {error}")))?;
    let result = duplicates::engine::match_library(parsed).map_err(Error::from_reason)?;
    serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
}

/// Runs the duplicate engine on a JSON snapshot, on the calling thread.
#[napi]
pub fn match_library_json(input: String) -> Result<String> {
    run_match(&input)
}

pub struct MatchTask {
    input: String,
}

impl Task for MatchTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        run_match(&self.input)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Runs the duplicate engine on a libuv worker thread, so the caller's event loop keeps running.
#[napi]
pub fn match_library(input: String) -> AsyncTask<MatchTask> {
    AsyncTask::new(MatchTask { input })
}

#[napi]
pub fn image_print_from_gray(pixels: Buffer, width: u32, height: u32) -> Buffer {
    let print = image::image_print_from_gray(&pixels, width as usize, height as usize);
    image::encode_image_print(&print).into()
}

#[napi]
pub fn audio_print_from_samples(samples: Float32Array, duration_seconds: f64) -> Buffer {
    audio::encode_audio_print(&audio::audio_print_from_samples(&samples, duration_seconds)).into()
}

#[napi]
pub fn video_print_from_frames(
    duration_seconds: f64,
    interval_seconds: f64,
    frames: Buffer,
) -> Buffer {
    video::encode_video_print(&video::video_print_from_frames(
        duration_seconds,
        interval_seconds,
        &frames,
    ))
    .into()
}

#[napi(object)]
pub struct AudioMatch {
    pub bit_error_rate: f64,
    pub offset_seconds: f64,
}

#[napi(object)]
pub struct VideoMatch {
    pub matched_frames: u32,
    pub compared_frames: u32,
    pub offset_seconds: f64,
}

#[napi]
pub fn compare_audio_prints(left: Buffer, right: Buffer) -> Option<AudioMatch> {
    let left = audio::decode_audio_print(&left)?;
    let right = audio::decode_audio_print(&right)?;
    audio::compare_audio_prints(&left, &right).map(|found| AudioMatch {
        bit_error_rate: found.bit_error_rate,
        offset_seconds: found.offset_seconds,
    })
}

#[napi]
pub fn compare_video_prints(left: Buffer, right: Buffer) -> Option<VideoMatch> {
    let left = video::decode_video_print(&left)?;
    let right = video::decode_video_print(&right)?;
    video::compare_video_prints(&left, &right).map(|found| VideoMatch {
        matched_frames: found.matched_frames,
        compared_frames: found.compared_frames,
        offset_seconds: found.offset_seconds,
    })
}
