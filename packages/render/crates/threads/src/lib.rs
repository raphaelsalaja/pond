//! Threads post layout, drawn to match Pond's Threads card (`threads/card`).

#![forbid(unsafe_code)]

use kit::display::{DisplayList, ImageRef, Item, Rect, Shape};
use kit::{Images, Options, Rendered, Rgba, TextStyle, Theme};
use serde::Deserialize;
use xeet_core::inline::Span;

const WIDTH_PAD: f32 = 16.0;
const SINGLE_MAX_H: f32 = 430.0;
const SINGLE_MAX_H_COMPACT: f32 = 280.0;
const CAROUSEL_H: f32 = 280.0;
const CAROUSEL_H_COMPACT: f32 = 200.0;
const MAX_TILES: usize = 8;
const DEFAULT_RATIO: f32 = 4.0 / 5.0;

/// A post the host has already formatted: dates, counts and entity runs are display strings.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Post {
    author: Author,
    text: Vec<Run>,
    media: Vec<Media>,
    parent: Option<Box<Nested>>,
    quoted: Option<Box<Nested>>,
    card: Option<Card>,
    replying_to: Option<String>,
    timestamp: String,
    metrics: Vec<Metric>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Author {
    name: String,
    initials: String,
    verified: bool,
    avatar: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Run {
    text: String,
    link: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Media {
    src: Option<String>,
    width: f32,
    height: f32,
    video: bool,
    duration: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Nested {
    author: Author,
    text: Vec<Run>,
    media: Vec<Media>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Card {
    domain: String,
    title: String,
    description: String,
    image: Option<String>,
    large: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Metric {
    icon: String,
    value: String,
}

/// Threads' own palette, as in the card's CSS.
struct Palette {
    bg: Rgba,
    text: Rgba,
    secondary: Rgba,
    border: Rgba,
    link: Rgba,
    placeholder: Rgba,
    overlay: Rgba,
}

impl Palette {
    fn of(theme: Theme) -> Palette {
        let overlay = Rgba::rgba(0, 0, 0, 173);
        match theme {
            Theme::Light => Palette {
                bg: Rgba::hex(0xffffff),
                text: Rgba::hex(0x000000),
                secondary: Rgba::hex(0x737373),
                border: Rgba::hex(0xe5e5e5),
                link: Rgba::hex(0x0095f6),
                placeholder: Rgba::hex(0xefefef),
                overlay,
            },
            Theme::Dark => Palette {
                bg: Rgba::hex(0x000000),
                text: Rgba::hex(0xf5f5f5),
                secondary: Rgba::hex(0xa3a3a3),
                border: Rgba::hex(0x262626),
                link: Rgba::hex(0x0095f6),
                placeholder: Rgba::hex(0x171717),
                overlay,
            },
        }
    }
}

struct Ctx<'a> {
    list: DisplayList,
    images: &'a Images,
    p: Palette,
    stack: xeet_core::fonts::Stack,
}

impl Ctx<'_> {
    /// `font-size`/`line-height` in the card's tokens; `normal` resolves to SF's rounded ascent plus descent.
    fn style(&self, size: f32, line_height: f32) -> TextStyle {
        TextStyle {
            stack: self.stack,
            size,
            line_height,
            weight: 400,
            color: self.p.text,
            max_lines: None,
        }
    }

    fn icon(&mut self, name: &str, x: f32, y: f32, size: f32, color: Rgba) {
        self.list.push(Item::Icon {
            name: name.to_string(),
            rect: Rect::new(x, y, size, size),
            color,
        });
    }

    fn runs(&self, runs: &[Run], style: &TextStyle) -> Vec<Span> {
        let spans: Vec<Span> = runs
            .iter()
            .filter(|r| !r.text.is_empty())
            .map(|r| {
                let color = if r.link { self.p.link } else { style.color };
                Span::new(&r.text, color, style.weight)
            })
            .collect();
        if spans.is_empty() {
            vec![style.span("")]
        } else {
            spans
        }
    }

    /// A round avatar, or the card's initials fallback on the placeholder.
    fn avatar(&mut self, key: ImageRef, author: &Author, x: f32, y: f32, size: f32) {
        let shape = Shape::rounded(Rect::new(x, y, size, size), size / 2.0);
        kit::image(&mut self.list, self.images, key.clone(), shape, self.p.placeholder);
        if self.images.aspect(&key).is_none() && !author.initials.is_empty() {
            let block = self
                .style(16.0, 18.0)
                .weight(700)
                .color(self.p.secondary)
                .text(&author.initials, size);
            self.list.push_text(
                &block,
                x + (size - block.width) / 2.0,
                y + (size - block.height) / 2.0,
            );
        }
    }

    /// Username in bold with the Meta badge, clipped to one 20px line.
    fn name(&mut self, author: &Author, x: f32, y: f32, width: f32, badge: f32) {
        let gap = 4.0;
        let room = if author.verified { width - badge - gap } else { width };
        let block = self.style(16.0, 20.0).weight(700).lines(1).text(&author.name, room.max(0.0));
        self.list.push_text(&block, x, y);
        if author.verified {
            let bx = x + block.width + gap;
            self.icon("meta-verified", bx, y + (20.0 - badge) / 2.0, badge, self.p.link);
        }
    }

    /// The media block for `media`, top at `y`; returns its height.
    fn media(&mut self, media: &[Media], key: &dyn Fn(usize) -> ImageRef, x: f32, y: f32, width: f32, compact: bool) -> f32 {
        let tiles = &media[..media.len().min(MAX_TILES)];
        match tiles {
            [] => 0.0,
            [one] => {
                let max_h = if compact { SINGLE_MAX_H_COMPACT } else { SINGLE_MAX_H };
                let k = key(0);
                let ratio = ratio_of(one).or_else(|| self.images.aspect(&k));
                let Some(ratio) = ratio else { return 0.0 };
                let (w, h) = if ratio_of(one).is_some() {
                    let w = width.min(max_h * ratio);
                    (w, (w / ratio).min(max_h))
                } else {
                    (width, (width / ratio).min(max_h))
                };
                self.tile(one, k, Rect::new(x, y, w, h));
                h
            }
            _ => {
                let h = if compact { CAROUSEL_H_COMPACT } else { CAROUSEL_H };
                self.list.push(Item::PushClip {
                    shape: Shape::rect(Rect::new(x, y, width, h)),
                });
                let mut tx = x;
                for (i, m) in tiles.iter().enumerate() {
                    if tx >= x + width {
                        break;
                    }
                    let w = (h * ratio_of(m).unwrap_or(DEFAULT_RATIO)).round();
                    self.tile(m, key(i), Rect::new(tx, y, w, h));
                    tx += w + 6.0;
                }
                self.list.push(Item::PopClip);
                h
            }
        }
    }

    fn tile(&mut self, media: &Media, key: ImageRef, rect: Rect) {
        kit::image(&mut self.list, self.images, key, Shape::rounded(rect, 8.0), self.p.placeholder);
        if !media.video {
            return;
        }
        let (cx, cy) = (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0);
        self.list.push(Item::Fill {
            shape: Shape::rounded(Rect::new(cx - 22.0, cy - 22.0, 44.0, 44.0), 22.0),
            color: self.p.overlay,
        });
        self.icon("media-play", cx - 11.0, cy - 11.0, 22.0, Rgba::hex(0xffffff));
        if let Some(duration) = media.duration.as_deref().filter(|d| !d.is_empty()) {
            let block = self.style(12.0, 15.0).weight(600).color(Rgba::hex(0xffffff)).text(duration, rect.w);
            let (bw, bh) = (block.width + 12.0, block.height + 2.0);
            let (bx, by) = (rect.x + 8.0, rect.y + rect.h - 8.0 - bh);
            self.list.push(Item::Fill {
                shape: Shape::rounded(Rect::new(bx, by, bw, bh), 4.0),
                color: self.p.overlay,
            });
            self.list.push_text(&block, bx + 6.0, by + 1.0);
        }
    }

    /// `parent/`: avatar rail with a connector, then the parent's name, text and media.
    fn parent(&mut self, parent: &Nested, x: f32, y: f32, width: f32) -> f32 {
        let cx = x + 36.0 + 12.0;
        let cw = width - 48.0;
        let mut cy = y;
        self.name(&parent.author, cx, cy, cw, 16.0);
        cy += 20.0;
        if !parent.text.is_empty() {
            let style = self.style(16.0, 20.0);
            let block = style.layout(&self.runs(&parent.text, &style), cw);
            cy += 2.0;
            self.list.push_text(&block, cx, cy);
            cy += block.height;
        }
        if !parent.media.is_empty() {
            cy += 8.0;
            cy += self.media(&parent.media, &|i| key(format!("parent:media:{i}")), cx, cy, cw, false);
        }
        let h = (cy - y + 16.0).max(36.0 + 12.0);
        self.avatar(key("parent:avatar"), &parent.author, x, y, 36.0);
        let line_top = y + 36.0 + 6.0;
        let line_h = (y + h - 6.0 - line_top).max(0.0);
        self.list.push(Item::Fill {
            shape: Shape::rounded(Rect::new(x + 17.0, line_top, 2.0, line_h), 1.0),
            color: self.p.border,
        });
        h
    }

    /// `quoted/`: a bordered box with a compact header, six lines of plain text and compact media.
    fn quoted(&mut self, quoted: &Nested, x: f32, y: f32, width: f32) -> f32 {
        let (ix, iw) = (x + 17.0, width - 34.0);
        let mut cy = y + 17.0;
        self.avatar(key("quoted:avatar"), &quoted.author, ix, cy, 22.0);
        self.name(&quoted.author, ix + 22.0 + 8.0, cy + 1.0, iw - 30.0, 14.0);
        cy += 22.0;
        let text: String = quoted.text.iter().map(|r| r.text.as_str()).collect();
        if !text.is_empty() {
            let block = self.style(16.0, 20.0).lines(6).text(&text, iw);
            cy += 8.0;
            self.list.push_text(&block, ix, cy);
            cy += block.height;
        }
        if !quoted.media.is_empty() {
            cy += 8.0;
            cy += self.media(&quoted.media, &|i| key(format!("quoted:media:{i}")), ix, cy, iw, true);
        }
        let h = cy + 17.0 - y;
        kit::hairline(&mut self.list, Shape::rounded(Rect::new(x, y, width, h), 8.0), self.p.border);
        h
    }

    /// `link-card/`: a large image card with "From domain", or a bordered row with a square thumb.
    fn card(&mut self, card: &Card, x: f32, y: f32, width: f32) -> f32 {
        let k = key("card:image");
        let has_image = self.images.aspect(&k).is_some() || card.image.is_some();
        if card.large && has_image {
            let h = width / 1.91;
            let outer = Shape::rounded(Rect::new(x, y, width, h), 12.0);
            kit::image(&mut self.list, self.images, k, Shape::rounded(Rect::new(x + 1.0, y + 1.0, width - 2.0, h - 2.0), 11.0), self.p.placeholder);
            kit::hairline(&mut self.list, outer, self.p.border);
            if !card.title.is_empty() {
                let block = self.style(14.0, 16.0).color(Rgba::hex(0xffffff)).lines(1).text(&card.title, width - 24.0 - 12.0);
                let (bw, bh) = (block.width + 12.0, 20.0);
                let (bx, by) = (x + 12.0, y + h - 12.0 - bh);
                self.list.push(Item::Fill {
                    shape: Shape::rounded(Rect::new(bx, by, bw, bh), 4.0),
                    color: self.p.overlay,
                });
                self.list.push_text(&block, bx + 6.0, by + 2.0);
            }
            let mut total = h;
            if !card.domain.is_empty() {
                let block = self.style(16.0, 20.0).color(self.p.secondary).text(&format!("From {}", card.domain), width);
                self.list.push_text(&block, x, y + h + 4.0);
                total += 4.0 + block.height;
            }
            return total;
        }

        let thumb = if has_image { 130.0 } else { 0.0 };
        let dw = width - 2.0 - thumb - 24.0;
        let mut blocks = Vec::new();
        if !card.domain.is_empty() {
            blocks.push(self.style(16.0, 20.0).color(self.p.secondary).lines(1).text(&card.domain, dw));
        }
        if !card.title.is_empty() {
            blocks.push(self.style(16.0, 20.0).lines(1).text(&card.title, dw));
        }
        if !card.description.is_empty() {
            blocks.push(self.style(16.0, 20.0).color(self.p.secondary).lines(2).text(&card.description, dw));
        }
        let detail_h = blocks.iter().map(|b| b.height).sum::<f32>() + 2.0 * blocks.len().saturating_sub(1) as f32 + 24.0;
        let inner_h = detail_h.max(thumb);
        let h = inner_h + 2.0;
        if has_image {
            let clip = Shape {
                rect: Rect::new(x + 1.0, y + 1.0, thumb - 1.0, inner_h),
                radii: kit::display::Radii { tl: 11.0, tr: 0.0, br: 0.0, bl: 11.0 },
                corner: Default::default(),
            };
            kit::image(&mut self.list, self.images, k, clip, self.p.placeholder);
            self.list.push(Item::Fill {
                shape: Shape::rect(Rect::new(x + thumb, y + 1.0, 1.0, inner_h)),
                color: self.p.border,
            });
        }
        let mut ty = y + 1.0 + (inner_h - detail_h) / 2.0 + 12.0;
        for block in &blocks {
            self.list.push_text(block, x + 1.0 + thumb + 12.0, ty);
            ty += block.height + 2.0;
        }
        kit::hairline(&mut self.list, Shape::rounded(Rect::new(x, y, width, h), 12.0), self.p.border);
        h
    }
}

fn key(name: impl Into<String>) -> ImageRef {
    ImageRef::Card(name.into())
}

fn ratio_of(media: &Media) -> Option<f32> {
    (media.width > 0.0 && media.height > 0.0).then(|| media.width / media.height)
}

fn add_media(images: &mut Images, prefix: &str, media: &[Media]) {
    for (i, m) in media.iter().enumerate() {
        images.add(key(format!("{prefix}:media:{i}")), m.src.as_deref());
    }
}

pub fn render(post: serde_json::Value, opts: &Options) -> Result<Rendered, String> {
    let post: Post = serde_json::from_value(post).map_err(|e| format!("threads post: {e}"))?;

    let mut images = Images::default();
    images.add(key("avatar"), post.author.avatar.as_deref());
    add_media(&mut images, "main", &post.media);
    if let Some(parent) = &post.parent {
        images.add(key("parent:avatar"), parent.author.avatar.as_deref());
        add_media(&mut images, "parent", &parent.media);
    }
    if let Some(quoted) = &post.quoted {
        images.add(key("quoted:avatar"), quoted.author.avatar.as_deref());
        add_media(&mut images, "quoted", &quoted.media);
    }
    if let Some(card) = &post.card {
        images.add(key("card:image"), card.image.as_deref());
    }

    let p = Palette::of(opts.theme);
    let mut cx = Ctx {
        list: DisplayList::new(opts.width, 0.0, p.bg),
        images: &images,
        p,
        stack: kit::stack("threads"),
    };
    let x = WIDTH_PAD;
    let w = opts.width - 2.0 * WIDTH_PAD;
    let mut y = WIDTH_PAD;

    if let Some(parent) = &post.parent {
        y += cx.parent(parent, x, y, w);
    }

    cx.avatar(key("avatar"), &post.author, x, y, 36.0);
    let name_w = w - 36.0 - 12.0 - 12.0 - 18.0;
    cx.name(&post.author, x + 48.0, y + 8.0, name_w, 16.0);
    let logo = cx.p.text;
    cx.icon("threads-logo", x + w - 18.0, y + 9.0, 18.0, logo);
    y += 36.0;

    if let (Some(handle), None) = (post.replying_to.as_deref(), &post.parent) {
        let style = cx.style(16.0, 18.0).color(cx.p.secondary);
        let spans = vec![style.span("Replying to "), Span::new(format!("@{handle}"), cx.p.link, 400)];
        let block = style.layout(&spans, w);
        y += 4.0;
        cx.list.push_text(&block, x, y);
        y += block.height;
    }

    if !post.text.is_empty() {
        let style = cx.style(16.0, 20.0);
        let block = style.layout(&cx.runs(&post.text, &style), w);
        y += 4.0;
        cx.list.push_text(&block, x, y);
        y += block.height;
    }

    if !post.media.is_empty() {
        y += 8.0;
        y += cx.media(&post.media, &|i| key(format!("main:media:{i}")), x, y, w, false);
    }

    if let Some(quoted) = &post.quoted {
        y += 12.0;
        y += cx.quoted(quoted, x, y, w);
    }

    if let Some(card) = &post.card {
        y += 12.0;
        y += cx.card(card, x, y, w);
    }

    if !post.timestamp.is_empty() {
        let block = cx.style(16.0, 18.0).color(cx.p.secondary).text(&post.timestamp, w);
        y += 16.0;
        cx.list.push_text(&block, x, y);
        y += block.height;
    }

    let metrics: Vec<&Metric> = post.metrics.iter().filter(|m| !m.icon.is_empty()).collect();
    if !metrics.is_empty() {
        y += 8.0;
        let mut mx = x;
        let secondary = cx.p.secondary;
        for m in metrics {
            cx.icon(&m.icon, mx, y, 18.0, secondary);
            let block = cx.style(14.0, 17.0).weight(500).color(secondary).text(&m.value, w);
            cx.list.push_text(&block, mx + 24.0, y + (18.0 - block.height) / 2.0);
            mx += 24.0 + block.width + 16.0;
        }
        y += 18.0;
    }

    cx.list.height = (y + WIDTH_PAD).ceil();
    let list = cx.list;
    Ok(kit::finish(list, opts, images))
}
