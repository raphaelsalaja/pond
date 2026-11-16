//! WebAssembly entry for Pond's post renderer.
//!
//! The host writes bytes into memory from [`alloc`], calls one export, and
//! reads the answer from [`out_ptr`] / [`out_len`]. A render answer is a
//! little-endian `u32` header length, the JSON header, then the PNG.

use serde::Deserialize;
use std::cell::RefCell;

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[derive(Deserialize)]
struct Request {
    source: String,
    post: serde_json::Value,
    #[serde(default)]
    options: serde_json::Value,
}

/// Renders one request, returning the PNG and its JSON header.
pub fn render(request: &str) -> Result<(Vec<u8>, String), String> {
    let req: Request = serde_json::from_str(request).map_err(|e| format!("request: {e}"))?;
    match req.source.as_str() {
        "twitter" => {
            let post = req.post.to_string();
            let opts = req.options.to_string();
            let (png, report) = xeet_core::render::render_json(&post, Some(&opts))
                .map_err(|e| format!("{e:?}"))?;
            let header = serde_json::json!({
                "width": report.size.width,
                "height": report.size.height,
                "warnings": report.warnings,
            });
            Ok((png, header.to_string()))
        }
        source => {
            let opts: kit::Options = serde_json::from_value(req.options).unwrap_or_default();
            let rendered = match source {
                "bluesky" => bluesky::render(req.post, &opts),
                "threads" => threads::render(req.post, &opts),
                _ => Err(format!("no layout for `{source}`")),
            }?;
            let header = serde_json::to_string(&rendered).map_err(|e| e.to_string())?;
            Ok((rendered.png, header))
        }
    }
}

fn set_out(bytes: Vec<u8>) {
    OUT.with(|out| *out.borrow_mut() = bytes);
}

fn input(ptr: *const u8, len: usize) -> &'static [u8] {
    if len == 0 {
        return &[];
    }
    // SAFETY: the host wrote `len` bytes at `ptr`, which it got from `alloc`.
    unsafe { std::slice::from_raw_parts(ptr, len) }
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    // SAFETY: `ptr` came from `alloc(len)` and nothing else owns it.
    unsafe { drop(Vec::from_raw_parts(ptr, 0, len.max(1))) }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|out| out.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    OUT.with(|out| out.borrow().len())
}

/// Registers font bytes for a manifest file name. Takes ownership of `data`.
/// Returns 0, or 1 with the error text in the output buffer.
#[no_mangle]
pub extern "C" fn register_font(
    name: *const u8,
    name_len: usize,
    data: *mut u8,
    data_len: usize,
    index: u32,
) -> u32 {
    let name = String::from_utf8_lossy(input(name, name_len)).into_owned();
    // SAFETY: `data` came from `alloc(data_len)` and was filled by the host,
    // which hands it over here and never touches it again.
    let bytes = unsafe { Vec::from_raw_parts(data, data_len, data_len.max(1)) };
    match xeet_core::fonts::register_font_at(&name, bytes, index) {
        Ok(()) => 0,
        Err(e) => {
            set_out(e.into_bytes());
            1
        }
    }
}

/// Every face the host has to supply, as JSON `[{ file, pack, family, stack }]`.
#[no_mangle]
pub extern "C" fn host_faces() -> u32 {
    let faces: Vec<_> = xeet_core::fonts::FACES
        .iter()
        .filter(|face| face.data.is_empty())
        .map(|face| {
            serde_json::json!({
                "file": face.file,
                "pack": face.pack,
                "family": face.family,
                "stack": xeet_core::fonts::STACKS.get(face.stack as usize),
            })
        })
        .collect();
    set_out(serde_json::to_vec(&faces).unwrap_or_default());
    0
}

/// The lazy font packs a request's text needs and the host has not registered,
/// as a JSON array of pack names.
#[no_mangle]
pub extern "C" fn missing_packs(request: *const u8, len: usize) -> u32 {
    let text = String::from_utf8_lossy(input(request, len));
    let packs = xeet_core::fonts::missing_packs_for_json(&text);
    set_out(serde_json::to_vec(&packs).unwrap_or_default());
    0
}

/// Renders one request. Returns 0 with the answer in the output buffer, or 1
/// with the error text.
#[no_mangle]
pub extern "C" fn render_post(request: *const u8, len: usize) -> u32 {
    let text = String::from_utf8_lossy(input(request, len));
    match render(&text) {
        Ok((png, header)) => {
            let mut out = Vec::with_capacity(4 + header.len() + png.len());
            out.extend_from_slice(&(header.len() as u32).to_le_bytes());
            out.extend_from_slice(header.as_bytes());
            out.extend_from_slice(&png);
            set_out(out);
            0
        }
        Err(e) => {
            set_out(e.into_bytes());
            1
        }
    }
}
