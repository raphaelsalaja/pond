import type { Save } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import type { LocalIngestExtras } from "./types";

export function collectRequestedUrls(payload: IngestPayload): string[] {
  const out: string[] = [];
  if (payload.mediaUrls && payload.mediaUrls.length > 0) {
    for (const m of payload.mediaUrls) {
      out.push(m.url);
      if (m.poster) out.push(m.poster);
    }
  } else if (payload.mediaUrl) {
    out.push(payload.mediaUrl);
  }
  return out;
}

export function extractAvatarUrl(payload: IngestPayload): string | null {
  const raw = payload.raw;
  if (!raw || typeof raw !== "object") return null;
  const container = (raw as Record<string, unknown>)[payload.source];
  if (!container || typeof container !== "object") return null;
  const url = (container as Record<string, unknown>).authorAvatar;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function extractUniversalFields(payload: IngestPayload): {
  lang: string | null;
  siteName: string | null;
  publishedAt: Date | null;
} {
  const raw = payload.raw;
  const container =
    raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>)[payload.source] as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const lang =
    typeof payload.lang === "string" && payload.lang.length > 0
      ? payload.lang
      : typeof container?.lang === "string" && container.lang.length > 0
        ? (container.lang as string)
        : null;
  const siteName =
    typeof payload.siteName === "string" && payload.siteName.length > 0
      ? payload.siteName
      : typeof container?.siteName === "string" && container.siteName.length > 0
        ? (container.siteName as string)
        : null;
  let publishedAt: Date | null =
    payload.publishedAt instanceof Date ? payload.publishedAt : null;
  if (!publishedAt && typeof container?.publishedAt === "string") {
    const parsed = new Date(container.publishedAt as string);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  return { lang, siteName, publishedAt };
}

export function extractPreviousMediaUrls(current: Save): string[] {
  const out: string[] = [];
  const raw = current.rawJson as unknown;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.gallery)) {
      for (const g of r.gallery as Array<Record<string, unknown>>) {
        if (typeof g.url === "string") out.push(g.url);
      }
    }
  }
  if (out.length === 0 && current.mediaUrl) out.push(current.mediaUrl);
  return out;
}

export function pickCoverDims(
  payload: IngestPayload,
  extras: LocalIngestExtras,
): { width: number; height: number } | undefined {
  if (extras.coverDims) return extras.coverDims;
  const first = payload.mediaUrls?.[0];
  if (
    first &&
    typeof first.width === "number" &&
    typeof first.height === "number" &&
    first.width > 0 &&
    first.height > 0
  ) {
    return { width: first.width, height: first.height };
  }
  return undefined;
}

export function isAuthoritativeText(
  next: string | null | undefined,
  current: string | null | undefined,
): next is string {
  if (!next) return false;
  const n = next.trim();
  if (!n) return false;
  const c = (current ?? "").trim();
  return n !== c;
}

export function isRicherText(
  next: string | null | undefined,
  current: string | null | undefined,
): next is string {
  if (!next) return false;
  const n = next.trim();
  if (!n) return false;
  const c = (current ?? "").trim();
  if (!c) return true;
  if (n === c) return false;
  return n.length > c.length;
}
