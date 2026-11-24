import type { Source, WatchKind } from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import { sourceIdFromUrl } from "../pipeline/url";
import { binariesAvailable } from "../refresh/binaries";
import { runWithTimeout } from "../refresh/yt-dlp-process";
import { ensureYtDlp } from "../refresh/yt-dlp-updater";
import type { WatchEntry, WatchHarvestResult } from "./types";

const LIST_TIMEOUT_MS = 60_000;
const LIST_CAP = 60;

function listUrl(
  source: Source,
  handle: string,
  kind?: WatchKind,
): string | null {
  if (source === "youtube") {
    if (kind === "playlist") {
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(handle)}`;
    }
    const [name = handle, tab] = handle.split("/", 2);
    const base = /^UC[\w-]{10,}$/.test(name)
      ? `https://www.youtube.com/channel/${encodeURIComponent(name)}`
      : `https://www.youtube.com/@${encodeURIComponent(name)}`;
    return `${base}/${tab === "shorts" || tab === "streams" ? tab : "videos"}`;
  }
  if (source === "tiktok") {
    return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
  }
  return null;
}

const FlatEntrySchema = z.preprocess(
  (text) => {
    try {
      const parsed: unknown = JSON.parse(String(text));
      return parsed;
    } catch {
      return null;
    }
  },
  z.object({
    id: z.string().nullish().catch(null),
    url: z.string().nullish().catch(null),
    webpage_url: z.string().nullish().catch(null),
  }),
);

export async function listYtdlpWatch(
  source: Source,
  handle: string,
  kind?: WatchKind,
  signal?: AbortSignal,
): Promise<WatchHarvestResult> {
  await ensureYtDlp();
  const { ytdlp } = binariesAvailable();
  if (!ytdlp) {
    log.warn("[pond watch:ytdlp] binary unavailable");
    return { ok: false, reason: "unavailable" };
  }
  const target = listUrl(source, handle, kind);
  if (!target) {
    return { ok: false, reason: "unknown" };
  }

  const argv = [
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--playlist-end",
    String(LIST_CAP),
    "--socket-timeout",
    "20",
    target,
  ];
  const { code, stdout, stderr } = await runWithTimeout(
    ytdlp,
    argv,
    LIST_TIMEOUT_MS,
    signal,
  );
  if (code === 124) {
    return { ok: false, reason: "timeout" };
  }
  if (code === 125) {
    return { ok: false, reason: "unknown" };
  }
  if (code !== 0 && stdout.trim().length === 0) {
    const tail = stderr.slice(-300);
    log.warn("[pond watch:ytdlp] listing failed", source, handle, code, tail);
    if (/404|not found|does not exist|unable to find/i.test(tail)) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const entries: Array<WatchEntry> = [];
  const seen = new Set<string>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    const decoded = FlatEntrySchema.safeParse(trimmed);
    if (!decoded.success) {
      continue;
    }
    const parsed = decoded.data;
    const url =
      parsed.webpage_url ??
      parsed.url ??
      (source === "youtube" && parsed.id
        ? `https://www.youtube.com/watch?v=${parsed.id}`
        : null);
    if (!url) {
      continue;
    }
    const sourceId = sourceIdFromUrl(source, url);
    if (!sourceId || seen.has(sourceId)) {
      continue;
    }
    seen.add(sourceId);
    entries.push({ url, sourceId });
  }
  return { ok: true, entries };
}
