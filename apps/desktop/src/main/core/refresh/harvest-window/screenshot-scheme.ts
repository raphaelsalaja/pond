/// <reference lib="dom" />

import sharp from "sharp";
import { z } from "zod";

export type CaptureColorScheme = "light" | "dark";
export type SchemeAssessment = CaptureColorScheme | "unknown" | "conflict";

export interface CaptureSchemeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WeightedLuminance {
  luminance: number;
  weight: number;
  direct: boolean;
}

export interface CaptureSchemeDomEvidence {
  backgrounds: Array<WeightedLuminance>;
  foregrounds: Array<WeightedLuminance>;
  mediaRects: Array<CaptureSchemeRect>;
}

export interface CapturedSchemeSample {
  bytes: Buffer;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  evidence: CaptureSchemeDomEvidence;
}

export type CaptureSchemeValidationResult<T extends CapturedSchemeSample> =
  | { ok: true; sample: T }
  | { ok: false; reason: "scheme_mismatch" };

const LIGHT_LUMINANCE = 0.72;
const DARK_LUMINANCE = 0.28;
const NEUTRAL_CHANNEL_SPREAD = 36;
const PIXEL_SAMPLE_CAP = 240_000;

const finiteNumber = z.number().refine(Number.isFinite);

const WeightedLuminanceSchema = z.object({
  luminance: finiteNumber.min(0).max(1),
  weight: finiteNumber.positive(),
  direct: z.boolean().catch(false),
});

const CaptureSchemeRectSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber,
  height: finiteNumber,
});

const emptyEvidence = (): CaptureSchemeDomEvidence => ({
  backgrounds: [],
  foregrounds: [],
  mediaRects: [],
});

export const captureSchemeDomEvidenceSchema = z
  .object({
    backgrounds: z.array(WeightedLuminanceSchema).catch([]),
    foregrounds: z.array(WeightedLuminanceSchema).catch([]),
    mediaRects: z.array(CaptureSchemeRectSchema).catch([]),
  })
  .catch(emptyEvidence());

export function buildCaptureSchemeEvidenceExpression(
  attribute: string,
  rect: CaptureSchemeRect,
): string {
  return `(${inPageCaptureSchemeEvidence.toString()})(${JSON.stringify(attribute)}, ${JSON.stringify(rect)})`;
}

function inPageCaptureSchemeEvidence(
  attribute: string,
  captureRect: CaptureSchemeRect,
): CaptureSchemeDomEvidence {
  const out: CaptureSchemeDomEvidence = {
    backgrounds: [],
    foregrounds: [],
    mediaRects: [],
  };
  const mediaSelector =
    'img,video,canvas,[role="img"],[data-testid="tweetPhoto"],[data-testid="videoPlayer"],[data-testid="videoComponent"],[data-testid="card.wrapper"],[data-testid="previewInterstitial"]';

  const parseColor = (value: string) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match || !match[1]) return null;
    const parts = match[1].split(",").map((part) => Number.parseFloat(part));
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    const a = parts.length > 3 ? parts[3] : 1;
    if (
      r === undefined ||
      g === undefined ||
      b === undefined ||
      a === undefined ||
      ![r, g, b, a].every(Number.isFinite)
    ) {
      return null;
    }
    return { r, g, b, a };
  };

  const luminance = (color: { r: number; g: number; b: number }): number =>
    (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;

  const neutral = (color: { r: number; g: number; b: number }): boolean =>
    Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) <=
    36;

  const overlapRatio = (rect: DOMRect): number => {
    const left = Math.max(rect.left, captureRect.x);
    const top = Math.max(rect.top, captureRect.y);
    const right = Math.min(rect.right, captureRect.x + captureRect.width);
    const bottom = Math.min(rect.bottom, captureRect.y + captureRect.height);
    const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
    const area = Math.max(1, rect.width * rect.height);
    return Math.min(1, overlap / area);
  };

  const addBackground = (
    el: Element,
    weight: number,
    direct: boolean,
  ): void => {
    const color = parseColor(getComputedStyle(el).backgroundColor || "");
    if (!color || color.a < 0.85 || !neutral(color)) return;
    out.backgrounds.push({ luminance: luminance(color), weight, direct });
  };

  const addMediaRect = (rect: DOMRect): void => {
    const left = Math.max(rect.left, captureRect.x);
    const top = Math.max(rect.top, captureRect.y);
    const right = Math.min(rect.right, captureRect.x + captureRect.width);
    const bottom = Math.min(rect.bottom, captureRect.y + captureRect.height);
    if (right - left < 2 || bottom - top < 2) return;
    out.mediaRects.push({
      x: left - captureRect.x,
      y: top - captureRect.y,
      width: right - left,
      height: bottom - top,
    });
  };

  for (const root of Array.from(document.querySelectorAll(`[${attribute}]`))) {
    addBackground(root, 12, true);

    let ancestor = root.parentElement;
    let depth = 0;
    while (ancestor && depth < 7) {
      const pageChrome =
        ancestor === document.body || ancestor === document.documentElement;
      addBackground(ancestor, pageChrome ? 5 : 3, pageChrome);
      ancestor = ancestor.parentElement;
      depth += 1;
    }

    const descendants = Array.from(root.querySelectorAll("*")).slice(0, 160);
    for (const el of descendants) {
      if (el.closest(mediaSelector)) continue;
      const rect = el.getBoundingClientRect();
      const overlap = overlapRatio(rect);
      if (overlap < 0.12) continue;
      addBackground(el, 1 + overlap * 2, false);
    }

    for (const el of descendants) {
      const rect = el.getBoundingClientRect();
      const overlap = overlapRatio(rect);
      if (overlap < 0.08) continue;
      const text = Array.from(el.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent?.trim() ?? "")
        .filter((part) => part.length > 0)
        .join(" ");
      if (!text) continue;
      const color = parseColor(getComputedStyle(el).color || "");
      if (!color || color.a < 0.85 || !neutral(color)) continue;
      out.foregrounds.push({
        luminance: luminance(color),
        weight: Math.min(5, Math.sqrt(text.length)) * overlap,
        direct: false,
      });
    }

    for (const media of Array.from(root.querySelectorAll(mediaSelector))) {
      addMediaRect(media.getBoundingClientRect());
    }
    for (const el of Array.from(root.querySelectorAll("*")).slice(0, 240)) {
      const image = getComputedStyle(el).backgroundImage;
      if (image && image !== "none") addMediaRect(el.getBoundingClientRect());
    }
  }

  return out;
}

interface SchemeVote {
  scheme: CaptureColorScheme | "unknown";
  strong: boolean;
}

function weightedSchemeVote(samples: Array<WeightedLuminance>): SchemeVote {
  let light = 0;
  let dark = 0;
  let directLight = 0;
  let directDark = 0;
  for (const sample of samples) {
    if (sample.luminance >= LIGHT_LUMINANCE) {
      light += sample.weight;
      if (sample.direct) directLight += sample.weight;
    } else if (sample.luminance <= DARK_LUMINANCE) {
      dark += sample.weight;
      if (sample.direct) directDark += sample.weight;
    }
  }
  const decided = light + dark;
  if (decided < 1.5) return { scheme: "unknown", strong: false };
  if (light / decided >= 0.66) {
    return { scheme: "light", strong: directLight >= 3 };
  }
  if (dark / decided >= 0.66) {
    return { scheme: "dark", strong: directDark >= 3 };
  }
  return { scheme: "unknown", strong: false };
}

export interface DomSchemeAssessment {
  scheme: SchemeAssessment;
  strong: boolean;
}

export function assessDomSchemeEvidence(
  evidence: CaptureSchemeDomEvidence,
): DomSchemeAssessment {
  const background = weightedSchemeVote(evidence.backgrounds);
  const foregroundVote = weightedSchemeVote(evidence.foregrounds);
  const foreground: SchemeVote =
    foregroundVote.scheme === "light"
      ? { scheme: "dark", strong: foregroundVote.strong }
      : foregroundVote.scheme === "dark"
        ? { scheme: "light", strong: foregroundVote.strong }
        : foregroundVote;

  if (
    background.scheme !== "unknown" &&
    foreground.scheme !== "unknown" &&
    background.scheme !== foreground.scheme
  ) {
    return { scheme: "conflict", strong: true };
  }
  if (background.scheme !== "unknown") return background;
  return foreground;
}

interface PixelCounts {
  sampled: number;
  neutral: number;
  light: number;
  dark: number;
}

function emptyPixelCounts(): PixelCounts {
  return { sampled: 0, neutral: 0, light: 0, dark: 0 };
}

function classifyPixelCounts(
  counts: PixelCounts,
): CaptureColorScheme | "unknown" {
  const decided = counts.light + counts.dark;
  if (counts.neutral < 80 || decided < 60) return "unknown";
  if (counts.light / decided >= 0.65) return "light";
  if (counts.dark / decided >= 0.65) return "dark";
  return "unknown";
}

export async function assessScreenshotPixels(args: {
  bytes: Buffer;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  mediaRects: Array<CaptureSchemeRect>;
}): Promise<CaptureColorScheme | "unknown"> {
  const scale = Math.min(
    1,
    Math.sqrt(PIXEL_SAMPLE_CAP / Math.max(1, args.width * args.height)),
  );
  const width = Math.max(1, Math.round(args.width * scale));
  const height = Math.max(1, Math.round(args.height * scale));
  const decoded = await sharp(args.bytes)
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const xScale = width / Math.max(1, args.cssWidth);
  const yScale = height / Math.max(1, args.cssHeight);
  const masks = args.mediaRects
    .map((rect) => ({
      left: rect.x * xScale - 1,
      top: rect.y * yScale - 1,
      right: (rect.x + rect.width) * xScale + 1,
      bottom: (rect.y + rect.height) * yScale + 1,
    }))
    .filter(
      (rect) =>
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < width &&
        rect.top < height,
    );

  const all = emptyPixelCounts();
  const edge = emptyPixelCounts();
  const edgeWidth = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const data = decoded.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const masked = masks.some(
        (rect) =>
          x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
      );
      if (masked) continue;
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      if (
        r === undefined ||
        g === undefined ||
        b === undefined ||
        a === undefined ||
        a < 128
      ) {
        continue;
      }
      const target =
        x < edgeWidth ||
        x >= width - edgeWidth ||
        y < edgeWidth ||
        y >= height - edgeWidth
          ? edge
          : all;
      target.sampled += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL_CHANNEL_SPREAD) {
        continue;
      }
      target.neutral += 1;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum >= LIGHT_LUMINANCE) target.light += 1;
      else if (lum <= DARK_LUMINANCE) target.dark += 1;
    }
  }

  const edgeAssessment = classifyPixelCounts(edge);
  const interiorAssessment = classifyPixelCounts(all);
  if (
    edgeAssessment !== "unknown" &&
    interiorAssessment !== "unknown" &&
    edgeAssessment !== interiorAssessment
  ) {
    return "unknown";
  }
  return edgeAssessment !== "unknown" ? edgeAssessment : interiorAssessment;
}

export function combineSchemeAssessments(
  dom: DomSchemeAssessment,
  pixels: CaptureColorScheme | "unknown",
): SchemeAssessment {
  if (dom.scheme === "conflict" || dom.scheme === "unknown") return dom.scheme;
  if (dom.strong) return dom.scheme;
  if (pixels === dom.scheme) return dom.scheme;
  return pixels === "unknown" ? "unknown" : "conflict";
}

export async function assessCapturedScheme(
  sample: CapturedSchemeSample,
): Promise<SchemeAssessment> {
  const dom = assessDomSchemeEvidence(sample.evidence);
  let width = sample.width;
  let height = sample.height;
  try {
    const metadata = await sharp(sample.bytes).metadata();
    width = metadata.width ?? width;
    height = metadata.height ?? height;
  } catch {
    return "unknown";
  }
  try {
    const pixels = await assessScreenshotPixels({
      bytes: sample.bytes,
      width,
      height,
      cssWidth: sample.cssWidth,
      cssHeight: sample.cssHeight,
      mediaRects: sample.evidence.mediaRects,
    });
    return combineSchemeAssessments(dom, pixels);
  } catch {
    return combineSchemeAssessments(dom, "unknown");
  }
}

export async function captureWithSchemeValidation<
  T extends CapturedSchemeSample,
>(args: {
  scheme: CaptureColorScheme;
  attempt: () => Promise<T>;
  correct: () => Promise<boolean>;
}): Promise<CaptureSchemeValidationResult<T>> {
  for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
    const sample = await args.attempt();
    const assessment = await assessCapturedScheme(sample);
    if (assessment === args.scheme) return { ok: true, sample };
    if (attemptIndex === 0 && (await args.correct())) continue;
    break;
  }
  return { ok: false, reason: "scheme_mismatch" };
}
