import type { ListKind } from "@pond/schema/db";
import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { z } from "zod";
import type { ListEntry } from "../list-types";

const WEB = "https://vimeo.com";

export interface ClipRow {
  id: string;
  at?: string;
}

/** Legacy list rows are `<li id="clip_<id>">` blocks; the first `<time datetime>` inside is when you liked or queued it. */
export function clipRows(html: string): Array<ClipRow> {
  const rows: Array<ClipRow> = [];
  const seen = new Set<string>();
  for (const part of html.split(/<li[^>]*\bid="clip_/).slice(1)) {
    const id = /^(\d+)"/.exec(part)?.[1];
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const row = part.split(/<\/li>/)[0] ?? "";
    const at = /<time[^>]*\bdatetime="([^"]+)"/.exec(row)?.[1];
    const parsed = at ? Date.parse(at) : Number.NaN;
    rows.push(
      Number.isFinite(parsed)
        ? { id, at: new Date(parsed).toISOString() }
        : { id },
    );
  }
  return rows;
}

export function hasNextPage(html: string): boolean {
  return /rel="next"/.test(html);
}

export const ViewerSchema = z.object({
  user: z
    .object({
      link: z.string().optional().catch(undefined),
      url: z.string().optional().catch(undefined),
    })
    .nullish()
    .catch(null),
  jwt: z.string().min(1),
});

export type VimeoViewer = z.infer<typeof ViewerSchema>;

const JwtPayloadSchema = z.object({ user_id: z.number().nullish() });

const VideoSchema = z.object({
  uri: z.string(),
  name: z.string().optional().catch(undefined),
  description: z.string().nullish().catch(undefined),
  release_time: z.string().optional().catch(undefined),
  duration: z.number().optional().catch(undefined),
  pictures: z
    .object({ base_link: z.string().optional().catch(undefined) })
    .nullish()
    .catch(undefined),
  user: z
    .object({
      name: z.string().optional().catch(undefined),
      link: z.string().optional().catch(undefined),
    })
    .nullish()
    .catch(undefined),
});

export type VimeoVideo = z.infer<typeof VideoSchema>;

export const VideosSchema = z.object({ data: z.array(z.unknown()).catch([]) });

export const VIDEO_FIELDS =
  "uri,name,description,release_time,duration,pictures.base_link,user.name,user.link";

/** Keyed by the numeric id in `uri`, because `link` is the vanity address when one exists. */
export function parseVideos(
  rows: ReadonlyArray<unknown>,
): Map<string, VimeoVideo> {
  const out = new Map<string, VimeoVideo>();
  for (const row of rows) {
    const parsed = VideoSchema.safeParse(row);
    const id = parsed.success
      ? /\/videos\/(\d+)/.exec(parsed.data.uri)?.[1]
      : undefined;
    if (parsed.success && id) {
      out.set(id, parsed.data);
    }
  }
  return out;
}

/** Viewer links can be vanity slugs; a viewer without one still has a numeric id in its token, and `user<id>` always resolves. */
export function handleFromViewer(viewer: VimeoViewer): string | null {
  const link = viewer.user?.link ?? viewer.user?.url;
  const fromLink = link?.split("/").filter(Boolean).pop();
  if (fromLink) {
    return fromLink;
  }
  try {
    const payload = JwtPayloadSchema.safeParse(
      JSON.parse(
        Buffer.from(viewer.jwt.split(".")[1] ?? "", "base64url").toString(
          "utf8",
        ),
      ),
    );
    const id = payload.success ? payload.data.user_id : null;
    return id ? `user${id}` : null;
  } catch {
    return null;
  }
}

export function clipEntry(
  row: ClipRow,
  video: VimeoVideo | undefined,
  kind: ListKind,
): ListEntry {
  const entry: ListEntry = {
    sourceId: row.id,
    url: `${WEB}/${row.id}`,
    mediaType: "video",
    listKinds: [kind],
  };
  if (row.at) {
    entry.savedAt = row.at;
  }
  if (video?.name) {
    entry.title = video.name;
  }
  if (video?.description) {
    entry.description = video.description;
  }
  if (video?.user?.name) {
    entry.author = video.user.name;
  }
  const poster = video?.pictures?.base_link;
  if (poster) {
    entry.mediaUrl = entry.url;
    entry.mediaUrls = [{ url: entry.url, type: "video", poster }];
  }
  return entry;
}

/** The video's media points at its page, so yt-dlp downloads it instead of the blob fetcher. */
export function captureFromVideo(id: string, video: VimeoVideo): Capture {
  const url = `${WEB}/${id}`;
  const media: CaptureMedia = { url, type: "video" };
  if (video.pictures?.base_link) {
    media.posterUrl = video.pictures.base_link;
  }
  if (video.duration) {
    media.durationSec = video.duration;
  }
  const capture: Capture = { id, source: "vimeo", url, media: [media] };
  if (video.name) {
    capture.title = video.name;
  }
  if (video.description) {
    capture.description = video.description;
  }
  if (video.release_time) {
    capture.publishedAt = video.release_time;
  }
  if (video.duration) {
    capture.duration = video.duration;
  }
  if (video.user?.name) {
    capture.author = { name: video.user.name };
    if (video.user.link) {
      capture.author.profileUrl = video.user.link;
    }
  }
  return capture;
}
