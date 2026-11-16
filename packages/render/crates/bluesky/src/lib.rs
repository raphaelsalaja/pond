//! Bluesky post layout: bsky.app's post page (`ThreadItemAnchor`) on desktop web, logged out.

#![forbid(unsafe_code)]

use kit::display::{DisplayList, ImageRef, Item, Radii, Rect, Shape};
use kit::{Images, Options, Rendered, Rgba, TextStyle, Theme};
use serde::Deserialize;
use xeet_core::inline::Span;

const PAD: f32 = 16.0;
const RADIUS: f32 = 12.0;

/// A post the host has already formatted: dates, counts and facet runs are display strings.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Post {
    author: Author,
    text: Vec<Run>,
    /// Short emoji-only text, which bsky.app draws 1.85× larger.
    emoji_only: bool,
    media: Media,
    card: Option<Card>,
    quote: Option<Box<Quote>>,
    date: String,
    stats: Vec<Stat>,
    controls: Controls,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Author {
    name: String,
    handle: String,
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
#[serde(default)]
struct Media {
    images: Vec<Picture>,
    video: Option<Picture>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Picture {
    src: Option<String>,
    width: f32,
    height: f32,
    duration: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Card {
    title: String,
    description: String,
    domain: String,
    image: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Quote {
    author: Author,
    time: String,
    text: String,
    media: Media,
    card: Option<Card>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Stat {
    value: String,
    label: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Controls {
    replies: String,
    reposts: String,
    likes: String,
}

/// `@bsky.app/alf` theme atoms for the light and dark themes.
struct Palette {
    bg: Rgba,
    text: Rgba,
    medium: Rgba,
    low: Rgba,
    border: Rgba,
    inset: Rgba,
    placeholder: Rgba,
    link: Rgba,
    control: Rgba,
    badge: Rgba,
}

impl Palette {
    fn of(theme: Theme) -> Palette {
        match theme {
            Theme::Light => Palette {
                bg: Rgba::hex(0xffffff),
                text: Rgba::hex(0x000000),
                medium: Rgba::hex(0x405168),
                low: Rgba::hex(0x8798b0),
                border: Rgba::hex(0xdce2ea),
                inset: Rgba::hex(0xdce2ea).alpha(0.6),
                placeholder: Rgba::hex(0xf9fafb),
                link: Rgba::hex(0x006aff),
                control: Rgba::hex(0x667b99),
                badge: Rgba::hex(0x006aff),
            },
            Theme::Dark => Palette {
                bg: Rgba::hex(0x000000),
                text: Rgba::hex(0xffffff),
                medium: Rgba::hex(0xa5b2c5),
                low: Rgba::hex(0x526580),
                border: Rgba::hex(0x232e3e),
                inset: Rgba::hex(0x405168).alpha(0.6),
                placeholder: Rgba::hex(0x111822),
                link: Rgba::hex(0x4291ff),
                control: Rgba::hex(0x667b99),
                badge: Rgba::hex(0x006aff),
            },
        }
    }
}

/// `normalizeTextStyles`: a unitless leading becomes whole pixels.
fn leading(size: f32, multiplier: f32) -> f32 {
    (size * multiplier).round()
}

const TEXT_XS: f32 = 11.3;
const TEXT_SM: f32 = 13.1;
const TEXT_MD: f32 = 15.0;
const TEXT_LG: f32 = 16.9;
const SNUG: f32 = 1.3;
const TIGHT: f32 = 1.15;

struct Ctx<'a> {
    list: DisplayList,
    images: &'a Images,
    p: Palette,
    stack: xeet_core::fonts::Stack,
}

impl Ctx<'_> {
    fn style(&self, size: f32, multiplier: f32) -> TextStyle {
        TextStyle {
            stack: self.stack,
            size,
            line_height: leading(size, multiplier),
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
            .map(|r| Span::new(&r.text, if r.link { self.p.link } else { style.color }, style.weight))
            .collect();
        if spans.is_empty() {
            vec![style.span("")]
        } else {
            spans
        }
    }

    fn avatar(&mut self, key: ImageRef, x: f32, y: f32, size: f32) {
        let r = (size / 2.0).floor();
        let placeholder = self.p.placeholder;
        kit::image(&mut self.list, self.images, key, Shape::rounded(Rect::new(x, y, size, size), r), placeholder);
    }

    /// `MediaInsetBorder`: a half-pixel line inside the media's edge on high-DPI screens.
    fn inset(&mut self, shape: Shape) {
        self.list.push(Item::Stroke {
            shape,
            color: self.p.inset,
            width: 0.5,
        });
    }

    fn picture(&mut self, key: ImageRef, shape: Shape) {
        let placeholder = self.p.placeholder;
        kit::image(&mut self.list, self.images, key, shape, placeholder);
        self.inset(shape);
    }

    /// Images or a video, top at `y`; returns the height including its top margin.
    fn media(&mut self, media: &Media, prefix: &str, x: f32, y: f32, width: f32) -> f32 {
        if let Some(video) = &media.video {
            return 4.0 + self.video(video, key(format!("{prefix}:video")), x, y + 4.0, width);
        }
        if media.images.is_empty() {
            return 0.0;
        }
        8.0 + self.grid(&media.images, prefix, x, y + 8.0, width)
    }

    /// `ImageEmbed` in the thread context: one uncropped image, or `ImageLayoutGrid`.
    fn grid(&mut self, images: &[Picture], prefix: &str, x: f32, y: f32, width: f32) -> f32 {
        let k = |i: usize| key(format!("{prefix}:image:{i}"));
        let gap = 4.0;
        let half = (width - gap) / 2.0;
        let cells: Vec<Rect> = match images.len() {
            1 => {
                let ratio = ratio_of(&images[0]).or_else(|| self.images.aspect(&k(0))).unwrap_or(1.0);
                let h = width / ratio.max(0.25);
                let shape = Shape::rounded(Rect::new(x, y, width, h), RADIUS);
                self.picture(k(0), shape);
                return h;
            }
            2 => vec![Rect::new(x, y, half, half), Rect::new(x + half + gap, y, half, half)],
            3 => {
                let small = (half - gap) / 2.0;
                vec![
                    Rect::new(x, y, half, half),
                    Rect::new(x + half + gap, y, half, small),
                    Rect::new(x + half + gap, y + small + gap, half, small),
                ]
            }
            _ => {
                let h = half / 1.5;
                vec![
                    Rect::new(x, y, half, h),
                    Rect::new(x + half + gap, y, half, h),
                    Rect::new(x, y + h + gap, half, h),
                    Rect::new(x + half + gap, y + h + gap, half, h),
                ]
            }
        };
        let total = cells.iter().map(|c| c.y + c.h).fold(0.0, f32::max) - y;
        self.list.push(Item::PushClip {
            shape: Shape::rounded(Rect::new(x, y, width, total), RADIUS),
        });
        for (i, cell) in cells.iter().enumerate() {
            self.picture(k(i), Shape::rect(*cell));
        }
        self.list.push(Item::PopClip);
        total
    }

    /// `VideoEmbed` on web: a box capped at 1:1, the poster contained on black.
    fn video(&mut self, video: &Picture, k: ImageRef, x: f32, y: f32, width: f32) -> f32 {
        let ratio = ratio_of(video).or_else(|| self.images.aspect(&k)).unwrap_or(16.0 / 9.0).max(0.5);
        let h = width * (1.0 / ratio).min(1.0);
        let w = h * ratio;
        let shape = Shape::rounded(Rect::new(x, y, w, h), RADIUS);
        self.list.push(Item::Fill { shape, color: Rgba::hex(0x000000) });
        if self.images.aspect(&k).is_some() {
            self.list.push(Item::PushClip { shape });
            self.list.push(Item::Image { shape, image: k, focus: (0.5, 0.5) });
            self.list.push(Item::PopClip);
        }
        if let Some(duration) = video.duration.as_deref().filter(|d| !d.is_empty()) {
            let block = self.style(12.0, 1.25).weight(600).color(Rgba::hex(0xffffff)).text(duration, w);
            let (bw, bh) = (block.width + 12.0, (block.height + 6.0).max(21.0));
            let (bx, by) = (x + 6.0, y + h - 6.0 - bh);
            self.list.push(Item::Fill {
                shape: Shape::rounded(Rect::new(bx, by, bw, bh), 6.0),
                color: Rgba::rgba(0, 0, 0, 128),
            });
            self.list.push_text(&block, bx + 6.0, by + (bh - block.height) / 2.0);
        }
        self.inset(shape);
        h
    }

    /// `ExternalEmbed`: thumb, title and description, a divider, then the domain with a globe.
    fn card(&mut self, card: &Card, prefix: &str, x: f32, y: f32, width: f32) -> f32 {
        let k = key(format!("{prefix}:card"));
        let has_thumb = self.images.aspect(&k).is_some() || card.image.is_some();
        let inner = width - 2.0;
        let mut cy = y + 1.0;
        if has_thumb {
            let h = inner / (1200.0 / 630.0);
            let shape = Shape {
                rect: Rect::new(x + 1.0, cy, inner, h),
                radii: Radii { tl: RADIUS - 1.0, tr: RADIUS - 1.0, br: 0.0, bl: 0.0 },
                corner: Default::default(),
            };
            let placeholder = self.p.placeholder;
            kit::image(&mut self.list, self.images, k, shape, placeholder);
            cy += h;
            kit::rule(&mut self.list, x + 1.0, cy, inner, self.p.border);
            cy += 1.0;
        }
        cy += 8.0;
        let tx = x + 1.0 + 12.0;
        let tw = inner - 24.0;
        let title = if card.title.is_empty() { &card.domain } else { &card.title };
        let title = self.style(TEXT_MD, SNUG).weight(600).lines(3).text(title, tw);
        self.list.push_text(&title, tx, cy);
        cy += title.height;
        if !card.description.is_empty() {
            let lines = if has_thumb { 2 } else { 4 };
            let desc = self.style(TEXT_SM, SNUG).lines(lines).text(&card.description, tw);
            cy += 3.0;
            self.list.push_text(&desc, tx, cy);
            cy += desc.height;
        }
        cy += 4.0 + 3.0;
        kit::rule(&mut self.list, tx, cy, tw, self.p.border);
        cy += 1.0 + 6.0;
        let domain = self.style(TEXT_XS, SNUG).color(self.p.medium).lines(1).text(&card.domain, tw - 14.0);
        let row = domain.height.max(12.0);
        let low = self.p.low;
        self.icon("bsky-earth", tx, cy + (row - 12.0) / 2.0, 12.0, low);
        self.list.push_text(&domain, tx + 14.0, cy + (row - domain.height) / 2.0);
        cy += row + 8.0 + 1.0;
        let h = cy - y;
        let border = self.p.border;
        kit::hairline(&mut self.list, Shape::rounded(Rect::new(x, y, width, h), RADIUS), border);
        h
    }

    /// `QuoteEmbed`: a bordered `PostMeta` with a 16px avatar, up to 20 lines of plain text, then media.
    fn quote(&mut self, quote: &Quote, x: f32, y: f32, width: f32) -> f32 {
        let (ix, iw) = (x + 13.0, width - 26.0);
        let mut cy = y + 13.0;
        let row = leading(TEXT_MD, TIGHT);
        self.avatar(key("quote:avatar"), ix, cy + (row - 16.0) / 2.0, 16.0);
        let mut mx = ix + 16.0 + 2.0 + 4.0;
        let name = self.style(TEXT_MD, TIGHT).weight(600).lines(1).text(&quote.author.name, iw * 0.7);
        self.list.push_text(&name, mx, cy);
        mx += name.width;
        if quote.author.verified {
            let badge = self.p.badge;
            self.icon("bsky-verified", mx + 2.0, cy + (row - 12.0) / 2.0, 12.0, badge);
            mx += 14.0;
        }
        let time = format!("\u{b7} {}", quote.time);
        let time_block = self.style(TEXT_MD, TIGHT).color(self.p.medium).text(&time, iw);
        let handle_room = (ix + iw - mx - 4.0 - time_block.width).max(0.0);
        let handle = self
            .style(TEXT_MD, TIGHT)
            .color(self.p.medium)
            .lines(1)
            .text(&format!("\u{a0}{}", quote.author.handle), handle_room);
        self.list.push_text(&handle, mx, cy);
        mx += handle.width;
        if !quote.time.is_empty() {
            self.list.push_text(&time_block, mx + 4.0, cy);
        }
        cy += row + 4.0;
        if !quote.text.is_empty() {
            let body = self.style(TEXT_MD, SNUG).lines(20).text(&quote.text, iw);
            self.list.push_text(&body, ix, cy);
            cy += body.height;
        }
        cy += self.media(&quote.media, "quote", ix, cy, iw);
        if let Some(card) = &quote.card {
            cy += 8.0;
            cy += self.card(card, "quote", ix, cy, iw);
        }
        let h = cy + 13.0 - y;
        let border = self.p.border;
        kit::hairline(&mut self.list, Shape::rounded(Rect::new(x, y, width, h), RADIUS), border);
        h
    }

    /// `PostControls big`: reply, repost and like in three slots, then bookmark, share and menu.
    fn controls(&mut self, controls: &Controls, x: f32, y: f32, width: f32) {
        let color = self.p.control;
        let row_w = width + 5.0;
        let row_x = x - 5.0;
        let right_w = 3.0 * 32.0 + 2.0 * 8.0;
        let left_w = (row_w - right_w - 12.0).min(320.0);
        let slot = (left_w + 2.0) / 3.0;
        let slots = [
            ("bsky-reply", controls.replies.as_str()),
            ("bsky-repost", controls.reposts.as_str()),
            ("bsky-like", controls.likes.as_str()),
        ];
        for (i, (icon, count)) in slots.iter().enumerate() {
            let bx = row_x - 2.0 + slot * i as f32;
            self.icon(icon, bx + 5.0, y + 5.0, 22.0, color);
            if !count.is_empty() {
                let block = self.style(TEXT_MD, SNUG).color(color).text(count, slot);
                self.list.push_text(&block, bx + 5.0 + 22.0 + 4.0, y + 5.0 + (22.0 - block.height) / 2.0);
            }
        }
        let mut rx = row_x + row_w - right_w;
        for icon in ["bsky-bookmark", "bsky-share", "bsky-menu"] {
            self.icon(icon, rx + 5.0, y + 5.0, 22.0, color);
            rx += 32.0 + 8.0;
        }
    }
}

fn key(name: impl Into<String>) -> ImageRef {
    ImageRef::Card(name.into())
}

fn ratio_of(p: &Picture) -> Option<f32> {
    (p.width > 0.0 && p.height > 0.0).then(|| p.width / p.height)
}

fn add_media(images: &mut Images, prefix: &str, media: &Media) {
    for (i, p) in media.images.iter().enumerate() {
        images.add(key(format!("{prefix}:image:{i}")), p.src.as_deref());
    }
    if let Some(video) = &media.video {
        images.add(key(format!("{prefix}:video")), video.src.as_deref());
    }
}

pub fn render(post: serde_json::Value, opts: &Options) -> Result<Rendered, String> {
    let post: Post = serde_json::from_value(post).map_err(|e| format!("bluesky post: {e}"))?;

    let mut images = Images::default();
    images.add(key("avatar"), post.author.avatar.as_deref());
    add_media(&mut images, "main", &post.media);
    if let Some(card) = &post.card {
        images.add(key("main:card"), card.image.as_deref());
    }
    if let Some(quote) = &post.quote {
        images.add(key("quote:avatar"), quote.author.avatar.as_deref());
        add_media(&mut images, "quote", &quote.media);
        if let Some(card) = &quote.card {
            images.add(key("quote:card"), card.image.as_deref());
        }
    }

    let p = Palette::of(opts.theme);
    let mut cx = Ctx {
        list: DisplayList::new(opts.width, 0.0, p.bg),
        images: &images,
        p,
        stack: kit::stack("bluesky"),
    };
    let x = PAD;
    let w = opts.width - 2.0 * PAD;
    let mut y = PAD;

    cx.avatar(key("avatar"), x, y, 42.0);
    let (nx, nw) = (x + 42.0 + 12.0, w - 54.0);
    let badge_room = if post.author.verified { 18.0 } else { 0.0 };
    let name = cx.style(TEXT_LG, SNUG).weight(600).lines(1).text(&post.author.name, nw - badge_room);
    cx.list.push_text(&name, nx, y);
    if post.author.verified {
        let badge = cx.p.badge;
        cx.icon("bsky-verified", nx + name.width + 4.0, y + (name.height - 14.0) / 2.0, 14.0, badge);
    }
    let handle = cx.style(TEXT_MD, SNUG).color(cx.p.medium).lines(1).text(&post.author.handle, nw);
    cx.list.push_text(&handle, nx, y + name.height);
    y += (name.height + handle.height).max(42.0) + 12.0;

    let has_text = post.text.iter().any(|r| !r.text.is_empty());
    if has_text {
        let size = if post.emoji_only { TEXT_LG * 1.85 } else { TEXT_LG };
        let style = cx.style(size, SNUG);
        let block = style.layout(&cx.runs(&post.text, &style), w);
        cx.list.push_text(&block, x, y);
        y += block.height;
    }

    let has_embed = !post.media.images.is_empty() || post.media.video.is_some() || post.card.is_some() || post.quote.is_some();
    if has_embed {
        if has_text {
            y += 4.0;
        }
        y += cx.media(&post.media, "main", x, y, w);
        if let Some(card) = &post.card {
            y += 8.0;
            y += cx.card(card, "main", x, y, w);
        }
        if let Some(quote) = &post.quote {
            y += 8.0;
            y += cx.quote(quote, x, y, w);
        }
        if has_text {
            y += 4.0;
        }
    }

    y += 12.0;
    let date = cx.style(TEXT_SM, SNUG).color(cx.p.medium).text(&post.date, w);
    cx.list.push_text(&date, x, y);
    y += date.height;

    if !post.stats.is_empty() {
        y += 12.0;
        let border = cx.p.border;
        kit::rule(&mut cx.list, x, y, w, border);
        y += 1.0 + 8.0;
        let line = leading(TEXT_MD, SNUG);
        let mut sx = x;
        for stat in &post.stats {
            let value_style = cx.style(TEXT_MD, SNUG).weight(600);
            let label_style = cx.style(TEXT_MD, SNUG).color(cx.p.medium);
            let spans = vec![value_style.span(&stat.value), label_style.span(format!(" {}", stat.label))];
            let block = label_style.layout(&spans, w);
            if sx > x && sx + block.width > x + w {
                sx = x;
                y += line + 8.0;
            }
            cx.list.push_text(&block, sx, y);
            sx += block.width + 16.0;
        }
        y += line + 8.0;
    }

    cx.controls(&post.controls, x, y, w);
    y += 32.0 + 2.0 + 8.0;

    cx.list.height = y.ceil();
    let list = cx.list;
    Ok(kit::finish(list, opts, images))
}
