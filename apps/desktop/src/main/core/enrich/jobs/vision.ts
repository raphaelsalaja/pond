import { readFile } from "node:fs/promises";
import type { Save, SaveClassification } from "@pond/schema/db";
import log from "electron-log/main.js";
import { itemFile } from "../../../paths";
import { type ProviderClient, visionExtract } from "../provider";

/**
 * Vision-based enrichment. One round-trip extracts caption, alt-text,
 * tags, classification and OCR'd text — costs ~one image-conditioned
 * call per save. Local LLaVA / Llama 3.2 Vision do all five together
 * comfortably; cloud vision models likewise.
 */
export interface VisionResult {
  caption: string | null;
  altText: string | null;
  tags: string[];
  classification: SaveClassification;
  ocrText: string | null;
}

const PROMPT = `Analyse the attached image and respond with strict JSON of shape:

{
  "caption": "<one sentence describing the image, suitable as alt-text>",
  "altText": "<short alt text under 120 chars>",
  "tags": ["<lowercase tag>", "<lowercase tag>", ...],
  "classification": "<one of: article, product, recipe, quote, video, image, code, other>",
  "ocr": "<all visible text in the image, exactly as written, or null if there is none>"
}

Rules:
- 3-8 tags. Lowercase. No # prefix. No spaces (use dashes).
- caption is a neutral one-sentence description.
- ocr should preserve linebreaks if the layout is clearly multi-line.
- Use null (not the string "null") when a field doesn't apply.`;

export async function enrichVision(
  client: ProviderClient,
  save: Save,
): Promise<VisionResult | null> {
  const cover = pickCoverFile(save);
  if (!cover) return null;
  const path = itemFile(save.id, cover.path);
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (err) {
    log.warn("[pond enrich/vision] could not read cover", save.id, err);
    return null;
  }
  const mime = guessMime(cover.path);
  const base64 = buf.toString("base64");
  let parsed: unknown;
  try {
    parsed = await visionExtract(client, base64, mime, PROMPT);
  } catch (err) {
    log.warn("[pond enrich/vision] call failed", save.id, err);
    return null;
  }
  return normalise(parsed);
}

function normalise(raw: unknown): VisionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const caption = stringOrNull(o.caption);
  const altText = stringOrNull(o.altText ?? o.alt_text);
  const ocrText = stringOrNull(o.ocr ?? o.ocrText);
  const classification = normaliseClassification(o.classification ?? o.kind);
  const tags = normaliseTags(o.tags);
  return { caption, altText, tags, classification, ocrText };
}

function normaliseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const cleaned = entry
      .toLowerCase()
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (cleaned.length === 0 || cleaned.length > 32) continue;
    out.add(cleaned);
    if (out.size >= 10) break;
  }
  return Array.from(out);
}

function normaliseClassification(raw: unknown): SaveClassification {
  if (typeof raw !== "string") return "other";
  const allowed = new Set([
    "article",
    "product",
    "recipe",
    "quote",
    "video",
    "image",
    "code",
    "other",
  ]);
  const lowered = raw.toLowerCase().trim();
  return (allowed.has(lowered) ? lowered : "other") as SaveClassification;
}

function stringOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function pickCoverFile(save: Save): { path: string } | null {
  const files = save.files ?? [];
  const cover = files.find((f) => {
    if (typeof f.path !== "string") return false;
    const lower = f.path.toLowerCase();
    if (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov")
    ) {
      return false;
    }
    return true;
  });
  return cover ? { path: cover.path } : null;
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}
