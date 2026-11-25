//! Threads post layout, measured against the post page on threads.com.

#![forbid(unsafe_code)]

use kit::display::{DisplayList, ImageRef, Item, Rect, Shape};
use kit::{Images, Options, Rendered, Rgba, TextStyle, Theme};
use serde::Deserialize;
use xeet_core::inline::Span;

const PAD_X: f32 = 24.0;
const TOP: f32 = 20.0;
const AVATAR: f32 = 36.0;
const GUTTER: f32 = 48.0;
const PARAGRAPH_GAP: f32 = 10.0;
const SINGLE_MAX_H: f32 = 430.0;
const SINGLE_MAX_H_COMPACT: f32 = 280.0;
const CAROUSEL_H: f32 = 280.0;
const CAROUSEL_H_COMPACT: f32 = 200.0;
/// The carousel's scroller keeps 5px under its tiles.
const CAROUSEL_TAIL: f32 = 5.0;
const TILE_GAP: f32 = 6.0;
/// Carousel tiles crop anything taller than 3:4.
const MIN_TILE_RATIO: f32 = 3.0 / 4.0;
const MAX_TILES: usize = 10;
const ACTIONS_H: f32 = 36.0;
const BOTTOM: f32 = 18.0;
/// Narrow posts shrink to their content so a portrait video isn't framed by an empty column.
const MIN_WIDTH: f32 = 360.0;

/// A post the host has already formatted: the relative time, counts and entity runs are display strings.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Post {
    author: Author,
    time: String,
    text: Vec<Run>,
    media: Vec<Media>,
    parent: Option<Box<Nested>>,
    quoted: Option<Box<Nested>>,
    card: Option<Card>,
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

#[derive(Debug, Default, Clone, Deserialize)]
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

/// An action button; an empty `value` draws the icon alone, as Threads does for zero.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Metric {
    icon: String,
    value: String,
}

/// threads.com's computed colors for the post column.
struct Palette {
    bg: Rgba,
    text: Rgba,
    secondary: Rgba,
    icon: Rgba,
    link: Rgba,
    line: Rgba,
    border: Rgba,
    avatar: Rgba,
    placeholder: Rgba,
    pill: Rgba,
}

impl Palette {
    fn of(theme: Theme) -> Palette {
        let pill = Rgba::rgba(40, 40, 40, 128);
        let link = Rgba::hex(0x0095f6);
        match theme {
            Theme::Light => Palette {
                bg: Rgba::hex(0xffffff),
                text: Rgba::hex(0x000000),
                secondary: Rgba::hex(0x999999),
                icon: Rgba::hex(0x424242),
                link,
                line: Rgba::hex(0xe5e5e5),
                border: Rgba::rgba(0, 0, 0, 38),
                avatar: Rgba::hex(0xfafafa),
                placeholder: Rgba::hex(0xf5f5f5),
                pill,
            },
            Theme::Dark => Palette {
                bg: Rgba::hex(0x181818),
                text: Rgba::hex(0xf3f5f7),
                secondary: Rgba::hex(0x777777),
                icon: Rgba::hex(0xcccccc),
                link,
                line: Rgba::hex(0x333638),
                border: Rgba::rgba(243, 245, 247, 38),
                avatar: Rgba::hex(0x0a0a0a),
                placeholder: Rgba::hex(0x262626),
                pill,
            },
        }
    }
}

struct Ctx<'a> {
    list: DisplayList,
    images: &'a Images,
    p: Palette,
    stack: xeet_core::fonts::Stack,
    width: f32,
    /// The rightmost edge anything has been drawn to.
    extent: f32,
}

impl Ctx<'_> {
    fn reach(&mut self, x: f32) {
        self.extent = self.extent.max(x);
    }

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

    fn body_style(&self) -> TextStyle {
        self.style(15.0, 21.0)
    }

    fn icon(&mut self, name: &str, x: f32, y: f32, size: f32, color: Rgba) {
        self.list.push(Item::Icon {
            name: name.to_string(),
            rect: Rect::new(x, y, size, size),
            color,
        });
    }

    fn spans(&self, runs: &[Run], style: &TextStyle) -> Vec<Span> {
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

    /// Body text with blank lines drawn as paragraph gaps; returns its height, 0 when empty.
    fn body(&mut self, runs: &[Run], x: f32, y: f32, width: f32, max_lines: Option<usize>) -> f32 {
        let mut style = self.body_style();
        style.max_lines = max_lines;
        let mut h = 0.0;
        for paragraph in paragraphs(runs) {
            if h > 0.0 {
                h += PARAGRAPH_GAP;
            }
            let block = style.layout(&self.spans(&paragraph, &style), width);
            self.list.push_text(&block, x, y + h);
            self.reach(x + block.width);
            h += block.height;
        }
        h
    }

    /// A round avatar on Threads' placeholder fill with its 0.5px ring, or initials when there are no bytes.
    fn avatar(&mut self, key: ImageRef, author: &Author, x: f32, y: f32, size: f32) {
        let shape = Shape::rounded(Rect::new(x, y, size, size), size / 2.0);
        kit::image(&mut self.list, self.images, key.clone(), shape, self.p.avatar);
        if self.images.aspect(&key).is_none() && !author.initials.is_empty() {
            let block = self
                .style(size * 0.4, size * 0.5)
                .weight(600)
                .color(self.p.secondary)
                .text(&author.initials, size);
            self.list.push_text(
                &block,
                x + (size - block.width) / 2.0,
                y + (size - block.height) / 2.0,
            );
        }
        self.list.push(Item::Stroke {
            shape,
            color: self.p.border,
            width: 0.5,
        });
    }

    /// Username, verified badge and relative time on one 21px line starting at `y`.
    fn header(&mut self, author: &Author, time: &str, x: f32, y: f32, right: f32) {
        let time_block = (!time.is_empty())
            .then(|| self.body_style().color(self.p.secondary).text(time, right - x));
        let badge = if author.verified { 4.0 + 12.0 } else { 0.0 };
        let reserved = badge + time_block.as_ref().map_or(0.0, |b| 6.0 + b.width);
        let name = self
            .body_style()
            .weight(600)
            .lines(1)
            .text(&author.name, (right - x - reserved).max(0.0));
        self.list.push_text(&name, x, y);
        let mut end = x + name.width;
        if author.verified {
            let link = self.p.link;
            self.icon("threads-verified", end + 4.0, y + 5.0, 12.0, link);
            end += badge;
        }
        if let Some(block) = time_block {
            self.list.push_text(&block, end + 6.0, y);
            end += 6.0 + block.width;
        }
        self.reach(end + 32.0);
    }

    /// The media block for `media`, top at `y`; carousels run off the card's right edge. Returns its height.
    fn media(&mut self, media: &[Media], key: &dyn Fn(usize) -> ImageRef, x: f32, y: f32, width: f32, compact: bool) -> f32 {
        let tiles = &media[..media.len().min(MAX_TILES)];
        match tiles {
            [] => 0.0,
            [one] => {
                let max_h = if compact { SINGLE_MAX_H_COMPACT } else { SINGLE_MAX_H };
                let k = key(0);
                let Some(ratio) = ratio_of(one).or_else(|| self.images.aspect(&k)) else {
                    return 0.0;
                };
                let w = width.min(max_h * ratio);
                let h = (w / ratio).min(max_h);
                self.tile(one, k, Rect::new(x, y, w, h));
                self.reach(x + w);
                h
            }
            _ => {
                let h = if compact { CAROUSEL_H_COMPACT } else { CAROUSEL_H };
                self.list.push(Item::PushClip {
                    shape: Shape::rect(Rect::new(0.0, y, self.width, h)),
                });
                let mut tx = x;
                for (i, m) in tiles.iter().enumerate() {
                    if tx >= self.width {
                        break;
                    }
                    let k = key(i);
                    let ratio = ratio_of(m).or_else(|| self.images.aspect(&k)).unwrap_or(MIN_TILE_RATIO);
                    let w = h * ratio.max(MIN_TILE_RATIO);
                    self.tile(m, k, Rect::new(tx, y, w, h));
                    tx += w + TILE_GAP;
                }
                self.list.push(Item::PopClip);
                self.reach(self.width);
                h + CAROUSEL_TAIL
            }
        }
    }

    /// One image or video poster: 8px corners, an inner hairline, and the mute pill on video.
    fn tile(&mut self, media: &Media, key: ImageRef, rect: Rect) {
        let shape = Shape::rounded(rect, 8.0);
        kit::image(&mut self.list, self.images, key, shape, self.p.placeholder);
        kit::hairline(&mut self.list, shape, self.p.border);
        if !media.video {
            return;
        }
        let (px, py) = (rect.x + rect.w - 16.0 - 28.0, rect.y + rect.h - 16.0 - 28.0);
        self.list.push(Item::Fill {
            shape: Shape::rounded(Rect::new(px, py, 28.0, 28.0), 14.0),
            color: self.p.pill,
        });
        self.icon("threads-muted", px + 8.0, py + 8.0, 12.0, Rgba::hex(0xffffff));
    }

    /// Like, Reply, Repost, Share and Save in a 36px row, laid out like threads.com's buttons:
    /// 12px padding, 18px icons (Like is 18.75), a 4px gap before a count that takes
    /// tabular-digit width, 44px for a button without a count, and 4px overlap between buttons.
    fn actions(&mut self, metrics: &[Metric], x: f32, y: f32) {
        let count = self.style(13.0, 18.2).color(self.p.icon);
        let color = self.p.icon;
        let mut start = x - 12.0;
        for m in metrics.iter().filter(|m| !m.icon.is_empty()) {
            let size = if m.icon == "threads-like" { 18.75 } else { 18.0 };
            let top = y + 18.0 - size / 2.0;
            let end = if m.value.is_empty() {
                let left = start + (44.0 - size) / 2.0;
                self.icon(&m.icon, left, top, size, color);
                self.reach(left + size);
                start + 44.0
            } else {
                let left = start + 12.0;
                self.icon(&m.icon, left, top, size, color);
                let cx = left + size + 4.0;
                let block = count.text(&m.value, 200.0);
                self.list.push_text(&block, cx, y + 8.9);
                let tabular: String = m.value.chars().map(|c| if c.is_ascii_digit() { '0' } else { c }).collect();
                let width = count.text(&tabular, 200.0).width;
                self.reach(cx + width);
                cx + width + 12.0
            };
            start = end - 4.0;
        }
    }

    /// The replied-to post above the focused one: indented body and a rail down to the next avatar.
    /// Returns the top of the next avatar.
    fn parent(&mut self, parent: &Nested, x: f32, a: f32, right: f32) -> f32 {
        let cx = x + GUTTER;
        let cw = right - cx;
        self.header(&parent.author, "", cx, a - 4.0, right - 32.0);
        let secondary = self.p.secondary;
        self.icon("threads-more", right - 20.0, a - 3.0, 20.0, secondary);
        let mut bottom = a - 4.0 + 21.0;
        let text_h = self.body(&parent.text, cx, a + 20.0, cw, None);
        if text_h > 0.0 {
            bottom = a + 20.0 + text_h;
        }
        if !parent.media.is_empty() {
            let top = bottom + 8.0;
            let h = self.media(&parent.media, &|i| key(format!("parent:media:{i}")), cx, top, cw, false);
            if h > 0.0 {
                bottom = top + h;
            }
        }
        self.avatar(key("parent:avatar"), &parent.author, x, a, AVATAR);
        let next = (bottom + 24.5).max(a + AVATAR + 24.5);
        let line_top = a + AVATAR + 8.0;
        self.list.push(Item::Fill {
            shape: Shape::rounded(Rect::new(x + 17.0, line_top, 2.0, (next - 8.5 - line_top).max(0.0)), 1.0),
            color: self.p.line,
        });
        next
    }

    /// A quoted post: a bordered box with a small header, six lines of plain text and compact media.
    fn quoted(&mut self, quoted: &Nested, x: f32, y: f32, width: f32) -> f32 {
        let (ix, iw) = (x + 16.0, width - 32.0);
        let mut cy = y + 16.0;
        self.avatar(key("quoted:avatar"), &quoted.author, ix, cy, 24.0);
        self.header(&quoted.author, "", ix + 32.0, cy + 1.5, ix + iw);
        cy += 24.0;
        let text_h = self.body(&quoted.text, ix, cy + 6.0, iw, Some(6));
        if text_h > 0.0 {
            cy += 6.0 + text_h;
        }
        if !quoted.media.is_empty() {
            cy += 8.0;
            cy += self.media(&quoted.media, &|i| key(format!("quoted:media:{i}")), ix, cy, iw, true);
        }
        let h = cy + 16.0 - y;
        kit::hairline(&mut self.list, Shape::rounded(Rect::new(x, y, width, h), 12.0), self.p.border);
        self.reach(x + width);
        h
    }

    /// A link preview: a large image with the domain under it, or a bordered row with a square thumb.
    fn card(&mut self, card: &Card, x: f32, y: f32, width: f32) -> f32 {
        self.reach(x + width);
        let k = key("card:image");
        let has_image = self.images.aspect(&k).is_some() || card.image.is_some();
        let body = self.body_style();
        if card.large && has_image {
            let h = width / 1.91;
            let shape = Shape::rounded(Rect::new(x, y, width, h), 12.0);
            kit::image(&mut self.list, self.images, k, shape, self.p.placeholder);
            kit::hairline(&mut self.list, shape, self.p.border);
            let mut total = h;
            if !card.domain.is_empty() {
                let block = body.color(self.p.secondary).lines(1).text(&card.domain, width);
                self.list.push_text(&block, x, y + h + 4.0);
                total += 4.0 + block.height;
            }
            if !card.title.is_empty() {
                let block = body.weight(600).lines(2).text(&card.title, width);
                self.list.push_text(&block, x, y + total);
                total += block.height;
            }
            return total;
        }

        let thumb = if has_image { 130.0 } else { 0.0 };
        let dw = width - thumb - 32.0;
        let mut blocks = Vec::new();
        if !card.domain.is_empty() {
            blocks.push(body.color(self.p.secondary).lines(1).text(&card.domain, dw));
        }
        if !card.title.is_empty() {
            blocks.push(body.weight(600).lines(2).text(&card.title, dw));
        }
        if !card.description.is_empty() {
            blocks.push(body.color(self.p.secondary).lines(2).text(&card.description, dw));
        }
        let detail_h = blocks.iter().map(|b| b.height).sum::<f32>() + 32.0;
        let h = detail_h.max(thumb);
        if has_image {
            let clip = Shape {
                rect: Rect::new(x, y, thumb, h),
                radii: kit::display::Radii { tl: 12.0, tr: 0.0, br: 0.0, bl: 12.0 },
                corner: Default::default(),
            };
            kit::image(&mut self.list, self.images, k, clip, self.p.placeholder);
            self.list.push(Item::Fill {
                shape: Shape::rect(Rect::new(x + thumb, y, 1.0, h)),
                color: self.p.border,
            });
        }
        let mut ty = y + (h - detail_h) / 2.0 + 16.0;
        for block in &blocks {
            self.list.push_text(block, x + thumb + 16.0, ty);
            ty += block.height;
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

/// Splits runs at blank lines, which Threads draws as separate paragraphs.
fn paragraphs(runs: &[Run]) -> Vec<Vec<Run>> {
    let mut out: Vec<Vec<Run>> = vec![Vec::new()];
    let push = |out: &mut Vec<Vec<Run>>, text: &str, link: bool| {
        if !text.is_empty() {
            if let Some(last) = out.last_mut() {
                last.push(Run { text: text.to_string(), link });
            }
        }
    };
    for run in runs {
        let mut rest = run.text.as_str();
        while let Some(i) = rest.find("\n\n") {
            push(&mut out, &rest[..i], run.link);
            rest = rest[i..].trim_start_matches('\n');
            out.push(Vec::new());
        }
        push(&mut out, rest, run.link);
    }
    out.retain(|p| p.iter().any(|r| !r.text.trim().is_empty()));
    out
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

    let (mut list, extent) = layout(&post, &images, opts.theme, opts.width);
    let fit = (extent.ceil() + PAD_X).max(MIN_WIDTH);
    if fit < opts.width {
        list = layout(&post, &images, opts.theme, fit).0;
    }
    Ok(kit::finish(list, opts, images))
}

/// Lays `post` out at `width`; returns the display list and the rightmost edge its content reached.
fn layout(post: &Post, images: &Images, theme: Theme, width: f32) -> (DisplayList, f32) {
    let p = Palette::of(theme);
    let mut cx = Ctx {
        list: DisplayList::new(width, 0.0, p.bg),
        images,
        p,
        stack: kit::stack("threads"),
        width,
        extent: 0.0,
    };
    let x = PAD_X;
    let right = width - PAD_X;

    let a = match &post.parent {
        Some(parent) => cx.parent(parent, x, TOP, right),
        None => TOP,
    };

    cx.avatar(key("avatar"), &post.author, x, a, AVATAR);
    cx.header(&post.author, &post.time, x + GUTTER, a + 7.5, right - 32.0);
    let secondary = cx.p.secondary;
    cx.icon("threads-more", right - 20.0, a + 8.5, 20.0, secondary);

    let mut bottom = a + AVATAR;
    let text_h = cx.body(&post.text, x, a + 49.0, right - x, None);
    if text_h > 0.0 {
        bottom = a + 49.0 + text_h;
    }
    let next_top = |bottom: f32| if bottom > a + AVATAR { bottom + 8.0 } else { a + 46.0 };

    if !post.media.is_empty() {
        let top = next_top(bottom);
        let h = cx.media(&post.media, &|i| key(format!("main:media:{i}")), x, top, right - x, false);
        if h > 0.0 {
            bottom = top + h;
        }
    }

    if let Some(quoted) = &post.quoted {
        let top = next_top(bottom);
        bottom = top + cx.quoted(quoted, x, top, right - x);
    }

    if let Some(card) = &post.card {
        let top = next_top(bottom);
        bottom = top + cx.card(card, x, top, right - x);
    }

    let row = bottom + 6.0;
    cx.actions(&post.metrics, x, row);

    cx.list.height = (row + ACTIONS_H + BOTTOM).ceil();
    (cx.list, cx.extent)
}
