//! Shared pieces for Pond's post layouts: options, images, text and output.

#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};
use xeet_core::display::{DisplayList, ImageRef, Item, Rect, Shape};
use xeet_core::fonts::{self, Stack};
use xeet_core::inline::{self, BlockStyle, Dir, Span, TextBlock, Wrap};
use xeet_core::paint::{self, DecodedImage, ImageSource};

pub use xeet_core::color::Rgba;
pub use xeet_core::display;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    pub theme: Theme,
    /// Card width in CSS pixels.
    pub width: f32,
    pub dpr: f32,
}

impl Default for Options {
    fn default() -> Options {
        Options {
            theme: Theme::Light,
            width: 550.0,
            dpr: 2.0,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rendered {
    #[serde(skip)]
    pub png: Vec<u8>,
    /// Size in CSS pixels; the PNG is this times the DPR.
    pub width: f32,
    pub height: f32,
    pub warnings: Vec<String>,
}

/// The stack a layout's fonts were registered under, or X's when the host has none.
pub fn stack(name: &str) -> Stack {
    fonts::stack(name).unwrap_or(fonts::X)
}

/// One block of text in a layout's own font stack.
#[derive(Clone, Copy, Debug)]
pub struct TextStyle {
    pub stack: Stack,
    pub size: f32,
    pub line_height: f32,
    pub weight: u16,
    pub color: Rgba,
    pub max_lines: Option<usize>,
}

impl TextStyle {
    pub fn weight(mut self, weight: u16) -> TextStyle {
        self.weight = weight;
        self
    }

    pub fn color(mut self, color: Rgba) -> TextStyle {
        self.color = color;
        self
    }

    pub fn lines(mut self, max: usize) -> TextStyle {
        self.max_lines = Some(max);
        self
    }

    pub fn span(&self, text: impl Into<String>) -> Span {
        Span::new(text, self.color, self.weight)
    }

    pub fn layout(&self, spans: &[Span], width: f32) -> TextBlock {
        inline::layout(
            spans,
            &BlockStyle {
                size: self.size,
                line_height: self.line_height,
                weight: self.weight,
                width,
                max_lines: self.max_lines,
                wrap: Wrap::Anywhere,
                preserve: true,
                dir: Dir::Auto,
                tab_size: 8.0,
                stack: self.stack,
            },
        )
    }

    pub fn text(&self, text: &str, width: f32) -> TextBlock {
        self.layout(&[self.span(text)], width)
    }
}

/// Splits `text` into spans, coloring @mentions, #hashtags and links.
pub fn linkify(text: &str, base: &TextStyle, link: Rgba) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut plain = String::new();
    let mut chars = text.char_indices().peekable();
    let flush = |plain: &mut String, spans: &mut Vec<Span>| {
        if !plain.is_empty() {
            spans.push(base.span(std::mem::take(plain)));
        }
    };
    while let Some((i, c)) = chars.next() {
        let starts_word = i == 0 || text[..i].ends_with(|p: char| p.is_whitespace() || p == '(');
        let rest = &text[i..];
        let entity_len = if starts_word && (c == '@' || c == '#') {
            let body = rest[1..]
                .find(|ch: char| !(ch.is_alphanumeric() || ch == '_' || ch == '.' || ch == '-'))
                .unwrap_or(rest.len() - 1);
            let body = rest[1..1 + body].trim_end_matches(['.', '-']);
            (!body.is_empty()).then_some(1 + body.len())
        } else if starts_word && (rest.starts_with("https://") || rest.starts_with("http://")) {
            let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
            Some(rest[..end].trim_end_matches(['.', ',', ')', '!', '?']).len())
        } else {
            None
        };
        match entity_len {
            Some(len) => {
                flush(&mut plain, &mut spans);
                spans.push(Span::new(&rest[..len], link, base.weight).role("entity"));
                while chars.peek().is_some_and(|(j, _)| *j < i + len) {
                    chars.next();
                }
            }
            None => plain.push(c),
        }
    }
    flush(&mut plain, &mut spans);
    if spans.is_empty() {
        spans.push(base.span(""));
    }
    spans
}

/// Images by reference, decoded from the base64 the host sent.
#[derive(Default)]
pub struct Images {
    entries: Vec<(ImageRef, DecodedImage)>,
    pub warnings: Vec<String>,
}

impl Images {
    /// Decodes `data` (base64, with or without a `data:` prefix) under `key`.
    /// Returns whether there is now an image to draw.
    pub fn add(&mut self, key: ImageRef, data: Option<&str>) -> bool {
        let Some(data) = data.filter(|d| !d.is_empty()) else {
            return false;
        };
        let payload = data.split_once(',').map_or(data, |(head, rest)| {
            if head.starts_with("data:") {
                rest
            } else {
                data
            }
        });
        let decoded = base64(payload)
            .ok_or_else(|| "not base64".to_string())
            .and_then(|bytes| {
                paint::decode_image(&bytes, &paint::Limits::default()).map_err(|e| format!("{e:?}"))
            });
        match decoded {
            Ok(image) => {
                self.entries.push((key, image));
                true
            }
            Err(e) => {
                self.warnings.push(format!("image {key:?} not drawn: {e}"));
                false
            }
        }
    }

    /// Width over height of an added image.
    pub fn aspect(&self, key: &ImageRef) -> Option<f32> {
        self.entries
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, d)| d.width as f32 / d.height.max(1) as f32)
    }
}

impl ImageSource for Images {
    fn rgba(&self, image: &ImageRef) -> Option<DecodedImage> {
        self.entries.rgba(image)
    }

    fn rgba_ref(&self, image: &ImageRef) -> Option<&DecodedImage> {
        self.entries.iter().find(|(k, _)| k == image).map(|(_, d)| d)
    }
}

/// An image clipped to `shape`, or a flat placeholder when there are no bytes.
pub fn image(list: &mut DisplayList, images: &Images, key: ImageRef, shape: Shape, empty: Rgba) {
    if images.rgba_ref(&key).is_some() {
        list.push(Item::Image {
            shape,
            image: key,
            focus: (0.5, 0.5),
        });
    } else {
        list.push(Item::Fill { shape, color: empty });
    }
}

/// A hairline inside `shape`'s edge.
pub fn hairline(list: &mut DisplayList, shape: Shape, color: Rgba) {
    list.push(Item::Stroke {
        shape,
        color,
        width: 1.0,
    });
}

/// A horizontal rule `width` wide at `y`.
pub fn rule(list: &mut DisplayList, x: f32, y: f32, width: f32, color: Rgba) {
    list.push(Item::Fill {
        shape: Shape::rect(Rect::new(x, y, width, 1.0)),
        color,
    });
}

/// Rasterizes `list`, then hands back the PNG with its size and warnings.
pub fn finish(list: DisplayList, opts: &Options, images: Images) -> Rendered {
    let png = paint::rasterize_png(&list, opts.dpr, &images);
    Rendered {
        png,
        width: list.width,
        height: list.height,
        warnings: images.warnings,
    }
}

fn base64(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc = 0u32;
    let mut bits = 0;
    for &b in s.as_bytes() {
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return None,
        };
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}
