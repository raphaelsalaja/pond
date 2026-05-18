import type { ChapterCue } from "@/components/video-player/chapters-vtt";
import type { Save } from "@/pool/types";

export interface YouTubeAuthor {
  name: string | null;
  avatarUrl: string | null;
  channelUrl: string | null;
}

export function getYouTubeChapters(save: Save): ChapterCue[] | undefined {
  const ytdlp = save.rawJson?.ytdlp?.chapters;
  if (!ytdlp || ytdlp.length === 0) return undefined;
  const out: ChapterCue[] = [];
  for (const c of ytdlp) {
    const title = (c.title ?? "").trim();
    if (!title) continue;
    if (typeof c.start_time !== "number") continue;
    out.push({
      title,
      startSec: c.start_time,
      endSec: typeof c.end_time === "number" ? c.end_time : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function getYouTubeAuthor(save: Save): YouTubeAuthor {
  const author = save.rawJson?.capture?.author;
  const ytdlp = save.rawJson?.ytdlp;
  return {
    name:
      author?.name ?? ytdlp?.channel ?? ytdlp?.uploader ?? save.author ?? null,
    avatarUrl: author?.avatarUrl ?? null,
    channelUrl:
      author?.profileUrl ?? ytdlp?.channel_url ?? ytdlp?.uploader_url ?? null,
  };
}

export const REVEAL_LABEL: string = (() => {
  if (typeof navigator === "undefined") return "Reveal in Finder";
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("win")) return "Show in Explorer";
  if (p.includes("linux")) return "Show in File Manager";
  return "Reveal in Finder";
})();

export function descriptionMatchesTitle(save: Save): boolean {
  if (!save.title || !save.description) return false;
  const norm = (s: string) =>
    s
      .replace(/[…\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const t = norm(save.title);
  const d = norm(save.description);
  if (!t || !d) return false;
  if (t === d) return true;
  if (d.startsWith(t)) return true;
  return false;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${trimZero(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trimZero(n / 1_000)}k`;
  return String(Math.round(n));
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatShortDate(value: string | number): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatHms(s: number): string {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts) return shorts[1] ?? null;
      const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1] ?? null;
    }
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function prettifyType(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "video") return "MP4";
  if (lower === "image") return "Image";
  if (lower === "link") return "Link";
  return t.toUpperCase();
}

export function pickAuthorColor(name: string): string {
  const palette = [
    "#d6409f",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#ef4444",
    "#14b8a6",
    "#0ea5e9",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] ?? "#3b82f6";
}

export function humaniseRefreshReason(
  reason:
    | "not_found"
    | "no_url"
    | "no_metadata"
    | "auth_required"
    | "blocked"
    | "internal_error",
): string {
  switch (reason) {
    case "not_found":
      return "This save no longer exists in the library.";
    case "no_url":
      return "This save has no source URL to refresh from.";
    case "blocked":
      return "Couldn't reach the source — the host may be offline or blocking us.";
    case "no_metadata":
      return "The source page didn't expose anything new.";
    case "auth_required":
      return "Connect this source to scrape pages that need a sign-in.";
    case "internal_error":
      return "Pond hit an unexpected error. Check the logs.";
  }
}

export const AUTH_WALLED: Record<
  string,
  { source: AuthWalledSource; label: string }
> = {
  "x.com": { source: "twitter", label: "X" },
  "twitter.com": { source: "twitter", label: "X" },
  "instagram.com": { source: "instagram", label: "Instagram" },
  "www.instagram.com": { source: "instagram", label: "Instagram" },
  "tiktok.com": { source: "tiktok", label: "TikTok" },
  "www.tiktok.com": { source: "tiktok", label: "TikTok" },
};

export type AuthWalledSource = "twitter" | "instagram" | "tiktok";

export const SOURCE_LABEL: Record<AuthWalledSource, string> = {
  twitter: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function classifyAuthWalled(
  save: Save,
): { source: AuthWalledSource; label: string } | null {
  if (
    save.source === "twitter" ||
    save.source === "instagram" ||
    save.source === "tiktok"
  ) {
    return { source: save.source, label: SOURCE_LABEL[save.source] };
  }
  if (!save.url) return null;
  try {
    const host = new URL(save.url).hostname.toLowerCase();
    const tail = host.split(".").slice(-3).join(".");
    return AUTH_WALLED[host] ?? AUTH_WALLED[tail] ?? null;
  } catch {
    return null;
  }
}
