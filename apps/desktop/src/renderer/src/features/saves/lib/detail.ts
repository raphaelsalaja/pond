import { IMPORT_ORIGIN_LABELS } from "@pond/schema/import-origin";
import { collectInfoRows } from "@/features/saves/lib/info-rows";
import { getSourceLabel } from "@/features/saves/lib/source-labels";
import type { Save } from "@/features/saves/types";
import {
  type AccountRef,
  accountDisplayName,
  findAccountRef,
} from "@/features/search/query";

type RowKind = "mono" | "author" | "account" | "platform" | "text";

export interface DetailRow {
  id: string;
  label: string;
  value: string;
  kind: RowKind;
  href?: string;
  accountId?: string;
  avatarUrl?: string | null;
  watch?: boolean;
}

const DETAIL_GROUPS = [
  {
    title: "Properties",
    ids: ["author", "from", "platform", "importedFrom", "type", "list"],
  },
  {
    title: "Activity",
    ids: [
      "views",
      "likes",
      "comments",
      "retweets",
      "quotes",
      "bookmarks",
      "shares",
    ],
  },
  {
    title: "File",
    ids: [
      "duration",
      "dimensions",
      "size",
      "container",
      "videoCodec",
      "audioCodec",
      "bitrate",
      "colorSpace",
      "id",
    ],
  },
  {
    title: "EXIF",
    ids: [
      "cameraMake",
      "cameraModel",
      "lensModel",
      "focalLength",
      "aperture",
      "exposureTime",
      "iso",
    ],
  },
  { title: "Dates", ids: ["taken", "published", "imported", "modified"] },
] as const;

export interface DetailGroup {
  title: string;
  rows: DetailRow[];
}

function asHttpUrl(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function profileUrlFromHandle(source: string, handle: string): string | null {
  const h = encodeURIComponent(handle.replace(/^@/, ""));
  if (!h) return null;
  if (source === "instagram") return `https://www.instagram.com/${h}/`;
  if (source === "twitter") return `https://x.com/${h}`;
  if (source === "threads") return `https://www.threads.com/@${h}`;
  if (source === "reddit") return `https://www.reddit.com/user/${h}/`;
  if (source === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (source === "pinterest") return `https://www.pinterest.com/${h}/`;
  if (source === "arena") return `https://www.are.na/${h}`;
  if (source === "youtube") return `https://www.youtube.com/@${h}`;
  if (source === "tumblr") return `https://www.tumblr.com/${h}`;
  if (source === "savee") return `https://savee.com/${h}/`;
  if (source === "behance") return `https://www.behance.net/${h}`;
  if (source === "vimeo") return `https://vimeo.com/${h}`;
  if (source === "dribbble") return `https://dribbble.com/${h}`;
  if (source === "unsplash") return `https://unsplash.com/@${h}`;
  if (source === "bluesky") return `https://bsky.app/profile/${h}`;
  return null;
}

export function pickAuthorProfileUrl(
  save: Pick<Save, "source" | "rawJson">,
): string | null {
  const capture = save.rawJson?.capture;
  const fromCapture = asHttpUrl(capture?.author?.profileUrl);
  if (fromCapture) return fromCapture;

  const fromYtdlp =
    asHttpUrl(save.rawJson?.ytdlp?.channel_url) ??
    asHttpUrl(save.rawJson?.ytdlp?.uploader_url);
  if (fromYtdlp) return fromYtdlp;

  const handle = capture?.author?.handle?.trim();
  if (!handle) return null;
  return profileUrlFromHandle(save.source, handle);
}

function pickFromRow(
  save: Pick<Save, "accountId">,
  refs: readonly AccountRef[],
): DetailRow | null {
  const id = save.accountId?.trim();
  if (!id) return null;
  const ref = findAccountRef(id, refs);
  if (!ref) return null;
  const row: DetailRow = {
    id: "from",
    label: ref.watch ? "Watch" : "Account",
    value: accountDisplayName(ref),
    kind: "account",
    accountId: ref.id,
  };
  if (ref.avatarUrl) row.avatarUrl = ref.avatarUrl;
  if (ref.watch) row.watch = true;
  return row;
}

export function collectIdentityRows(
  save: Save,
  refs: readonly AccountRef[] = [],
): DetailRow[] {
  const rows: DetailRow[] = [
    { id: "id", label: "ID", value: save.id, kind: "mono" },
  ];
  if (save.author) {
    const author: DetailRow = {
      id: "author",
      label: "Posted By",
      value: save.author,
      kind: "author",
    };
    const href = pickAuthorProfileUrl(save);
    if (href) author.href = href;
    rows.push(author);
  }
  const from = pickFromRow(save, refs);
  if (from) rows.push(from);
  rows.push({
    id: "platform",
    label: "Source",
    value: getSourceLabel(save.source),
    kind: "platform",
  });
  if (save.importedFrom) {
    rows.push({
      id: "importedFrom",
      label: "Imported From",
      value: IMPORT_ORIGIN_LABELS[save.importedFrom],
      kind: "text",
    });
  }
  for (const row of collectInfoRows(save)) {
    rows.push({ ...row, kind: "text" });
  }
  return rows;
}

export function groupDetailRows(rows: DetailRow[]): DetailGroup[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const placed = new Set<string>();
  const groups: DetailGroup[] = [];

  for (const group of DETAIL_GROUPS) {
    const next = group.ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      placed.add(id);
      return [row];
    });
    if (next.length === 0) continue;
    groups.push({ title: group.title, rows: next });
  }

  const leftover = rows.filter((row) => !placed.has(row.id));
  if (leftover.length > 0) {
    const properties = groups.find((group) => group.title === "Properties");
    if (properties) properties.rows.push(...leftover);
    else groups.unshift({ title: "Properties", rows: leftover });
  }

  return groups;
}

function normalizeForCompare(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isSameTitleAndContent(title: string, content: string): boolean {
  const a = normalizeForCompare(title);
  const b = normalizeForCompare(content);
  return a.length > 0 && a === b;
}
