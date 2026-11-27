import type { Save, SaveFile } from "@pond/schema/db";
import type { Capture, CaptureAuthor } from "@pond/schema/raw";
import {
  SHARE_PAGE_VERSION,
  SharePageLinkSchema,
  SharePageManifestSchema,
} from "@pond/schema/share-page";
import type {
  SharePageAuthor,
  SharePageImage,
  SharePageKind,
  SharePageManifest,
  SharePageMedia,
  SharePageSave,
} from "@pond/schema/share-page";
import { sourceLabel } from "@pond/schema/sources";
import {
  IMAGE_KIND,
  POSTER_KIND,
  POST_RENDER_LIGHT_KIND,
  THUMBNAIL_KIND,
  VIDEO_KIND,
} from "@shared/save-file-names";

/**
 * The only Save fields a Share Page reads. Anything added to a Save later stays private
 * until it's named here and copied in `planSave` on purpose.
 */
export type SharePageSaveRow = Pick<
  Save,
  | "id"
  | "title"
  | "description"
  | "url"
  | "source"
  | "author"
  | "publishedAt"
  | "notes"
  | "tags"
  | "files"
  | "rawJson"
  | "rotate"
  | "flipX"
  | "flipY"
>;

export interface SharePageOptions {
  notes: boolean;
  tags: boolean;
}

export const DEFAULT_SHARE_PAGE_OPTIONS: SharePageOptions = {
  notes: false,
  tags: false,
};

/** Videos past this size show their poster and a link to the original instead. */
export const VIDEO_SIZE_LIMIT = 300 * 1024 * 1024;

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

export type MediaRole = "image" | "thumbnail" | "video" | "poster";

/** One file to stage: read from the Save's folder, written under `media/` with its metadata removed. */
export interface MediaJob {
  saveId: string;
  /** The file's path inside the Save's folder, as `files` records it. */
  file: string;
  /** Where it lands, relative to the page. */
  to: string;
  role: MediaRole;
  /** The Save's own display rotation and flips, applied to stills. */
  orient: { rotate: number; flipX: boolean; flipY: boolean };
  /** A video's size as `files` records it; staging measures stills itself. */
  width?: number;
  height?: number;
}

export type PlannedMedia =
  | { kind: "image"; job: MediaJob }
  | { kind: "video"; job: MediaJob; poster?: MediaJob };

export interface PlannedSave {
  save: Omit<SharePageSave, "thumbnail" | "media">;
  thumbnail?: MediaJob;
  media: Array<PlannedMedia>;
}

export interface SharePagePlan {
  kind: SharePageKind;
  title: string;
  createdAt: string;
  saves: Array<PlannedSave>;
}

export interface StagedSize {
  width?: number;
  height?: number;
}

/** What staging made of each job, by its `to` path. A job that couldn't be staged has no entry. */
export type StagedMedia = ReadonlyMap<string, StagedSize>;

export function planSharePage(input: {
  kind: SharePageKind;
  title: string;
  rows: ReadonlyArray<SharePageSaveRow>;
  options: SharePageOptions;
  now: Date;
}): SharePagePlan {
  return {
    kind: input.kind,
    title: input.title.trim().slice(0, 400) || "Pond",
    createdAt: input.now.toISOString(),
    saves: input.rows.map((row, index) =>
      planSave(row, `s${index + 1}`, input.options),
    ),
  };
}

function planSave(
  row: SharePageSaveRow,
  id: string,
  options: SharePageOptions,
): PlannedSave {
  const capture = row.rawJson?.capture;
  const orient = {
    rotate: row.rotate,
    flipX: row.flipX,
    flipY: row.flipY,
  };
  const job = (file: SaveFile, role: MediaRole, suffix: string): MediaJob => ({
    saveId: row.id,
    file: file.path,
    to: `media/${id}-${suffix}.${outputExtension(file, role)}`,
    role,
    orient,
    width: file.width ?? undefined,
    height: file.height ?? undefined,
  });

  const posters = row.files.filter((file) => file.kind === POSTER_KIND);
  let videoIndex = 0;
  const media: Array<PlannedMedia> = [];
  for (const [index, file] of row.files.entries()) {
    if (file.kind === IMAGE_KIND && isStill(file)) {
      media.push({ kind: "image", job: job(file, "image", String(index)) });
    } else if (file.kind === VIDEO_KIND) {
      /** Posters pair with videos by position, the same rule the viewer in Pond uses. */
      const posterFile = posters[videoIndex];
      videoIndex += 1;
      const poster = posterFile
        ? job(posterFile, "poster", `${index}-poster`)
        : undefined;
      if (playable(file)) {
        media.push({
          kind: "video",
          job: job(file, "video", String(index)),
          poster,
        });
      } else if (poster) {
        media.push({ kind: "image", job: { ...poster, role: "image" } });
      }
    }
  }

  const cover =
    row.files.find((file) => file.kind === THUMBNAIL_KIND) ??
    row.files.find((file) => file.kind === POST_RENDER_LIGHT_KIND) ??
    row.files.find((file) => file.kind === IMAGE_KIND && isStill(file)) ??
    posters[0];

  const save: PlannedSave["save"] = {
    id,
    title: cleanText(row.title ?? capture?.title, 2000),
    text: cleanText(capture?.description ?? row.description, 100_000),
    url: link(row.url),
    source: sourceLabel(row.source),
    author: author(capture?.author, row.author),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : undefined,
    quote: quote(capture?.quoted),
    card: card(capture),
    notes: options.notes ? cleanText(row.notes, 100_000) : undefined,
    tags: options.tags && row.tags.length > 0 ? [...row.tags] : undefined,
  };

  return {
    save,
    thumbnail: cover ? job(cover, "thumbnail", "thumb") : undefined,
    media,
  };
}

/** Puts staged sizes into the plan. Media that couldn't be staged is left out, never linked broken. */
export function assembleManifest(
  plan: SharePagePlan,
  staged: StagedMedia,
): SharePageManifest {
  const image = (job: MediaJob | undefined): SharePageImage | undefined => {
    const size = job ? staged.get(job.to) : undefined;
    if (!job || !size?.width || !size.height) return undefined;
    return { src: job.to, width: size.width, height: size.height };
  };
  const saves = plan.saves.map(({ save, thumbnail, media }): SharePageSave => {
    const items = media.flatMap((item): Array<SharePageMedia> => {
      if (item.kind === "image") {
        const still = image(item.job);
        return still ? [{ kind: "image", ...still }] : [];
      }
      const video = staged.get(item.job.to);
      const poster = image(item.poster);
      if (!video) return poster ? [{ kind: "image", ...poster }] : [];
      return [
        {
          kind: "video",
          src: item.job.to,
          poster,
          width: video.width,
          height: video.height,
        },
      ];
    });
    return { ...save, thumbnail: image(thumbnail), media: items };
  });
  return SharePageManifestSchema.parse({
    version: SHARE_PAGE_VERSION,
    kind: plan.kind,
    title: plan.title,
    createdAt: plan.createdAt,
    saves,
  });
}

/** Every file the page needs, once each: an unplayable video's poster can also be its still. */
export function mediaJobs(plan: SharePagePlan): Array<MediaJob> {
  const jobs = plan.saves.flatMap(({ thumbnail, media }) => [
    ...(thumbnail ? [thumbnail] : []),
    ...media.flatMap((item) =>
      item.kind === "image"
        ? [item.job]
        : [item.job, ...(item.poster ? [item.poster] : [])],
    ),
  ]);
  return [...new Map(jobs.map((job) => [job.to, job])).values()];
}

function isStill(file: SaveFile): boolean {
  return !file.mimeType || file.mimeType.startsWith("image/");
}

function extensionOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function playable(file: SaveFile): boolean {
  return (
    VIDEO_EXTENSIONS.has(extensionOf(file.path)) &&
    file.size <= VIDEO_SIZE_LIMIT
  );
}

/** Stills become WebP, which keeps GIF animation; videos keep their container and are only remuxed. */
function outputExtension(file: SaveFile, role: MediaRole): string {
  if (role !== "video") return "webp";
  const extension = extensionOf(file.path);
  return extension === "m4v" ? "mp4" : extension;
}

function link(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return SharePageLinkSchema.safeParse(value).success ? value : undefined;
}

function cleanText(
  value: string | null | undefined,
  max: number,
): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, max) : undefined;
}

function author(
  captured: CaptureAuthor | undefined,
  fallback: string | null,
): SharePageAuthor | undefined {
  const name = cleanText(captured?.name ?? fallback, 400);
  const handle = cleanText(captured?.handle?.replace(/^@/, ""), 400);
  if (!name && !handle) return undefined;
  return { name, handle, url: link(captured?.profileUrl) };
}

function quote(captured: Capture | undefined): SharePageSave["quote"] {
  if (!captured) return undefined;
  const text = cleanText(captured.description ?? captured.title, 100_000);
  const url = link(captured.url);
  const by = author(captured.author, null);
  if (!text && !url) return undefined;
  return { author: by, text, url };
}

function card(capture: Capture | undefined): SharePageSave["card"] {
  const url = link(capture?.card?.url);
  if (!capture?.card || !url) return undefined;
  return {
    url,
    title: cleanText(capture.card.title, 2000),
    domain: cleanText(capture.card.domain, 400),
  };
}
