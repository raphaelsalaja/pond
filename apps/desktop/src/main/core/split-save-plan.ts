import { isManualSensitiveDecision } from "@pond/schema/content-safety";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
import {
  type Capture,
  type CaptureMedia,
  type RawJson,
  walkCaptureMedia,
} from "@pond/schema/raw";
import { isVideoFile } from "@shared/media-index";
import {
  isThumbnailKind,
  POSTER_KIND,
  pickCardFile,
  thumbnailSidecarCandidates,
} from "@shared/save-file-names";
import { slideFiles } from "@shared/save-slides";
import { isAvatarUrl } from "@shared/tweet-card";

export interface SaveSlide {
  primary: SaveFile;
  files: SaveFile[];
  video: boolean;
  /** Position in `walkCaptureMedia` order, or null when no capture media matches. */
  mediaIndex: number | null;
}

export interface SaveSplitPlan {
  postSourceId: string;
  /** The first slide, which stays on the original save. */
  keep: SaveSlide;
  /** Every other slide, in post order, each becoming its own save. */
  slides: SaveSlide[];
  /** Capture media positions the original keeps for later harvests. */
  keepMedia: number[];
}

type SplitSource = Pick<Save, "sourceId" | "files" | "rawJson">;

export function postSourceId(save: Pick<Save, "sourceId" | "rawJson">): string {
  return save.rawJson?.split?.sourceId ?? save.sourceId;
}

/** A refresh restarts ingest with a later start time, so only a save's first ingest matches its creation. */
export function splitsOnImport(
  save: Pick<Save, "createdAt" | "ingestStartedAt" | "files">,
  splitPosts: boolean,
): boolean {
  return (
    splitPosts &&
    save.ingestStartedAt?.getTime() === save.createdAt.getTime() &&
    slideFiles(save.files).length > 1
  );
}

export function planSaveSplit(save: SplitSource): SaveSplitPlan | null {
  const primaries = slideFiles(save.files);
  if (primaries.length < 2) return null;
  const posters = save.files.filter((file) => file.kind === POSTER_KIND);
  let videoIndex = 0;
  const media = walkCaptureMedia(save.rawJson?.capture);
  const indexes = matchCaptureMedia(primaries, media);
  const slides = primaries.map((primary, index): SaveSlide => {
    const video = isVideoFile(primary);
    const poster = video ? posters[videoIndex++] : undefined;
    return {
      primary,
      files: poster ? [primary, poster] : [primary],
      video,
      mediaIndex: indexes[index] ?? null,
    };
  });
  const mapped = slides.every((slide) => slide.mediaIndex != null);
  const ordered = mapped
    ? [...slides].sort((a, b) => (a.mediaIndex ?? 0) - (b.mediaIndex ?? 0))
    : slides;
  const [keep, ...rest] = ordered;
  if (!keep) return null;
  const taken = new Set(rest.map((slide) => slide.mediaIndex));
  const keepMedia = mapped
    ? media.flatMap((_, index) => (taken.has(index) ? [] : [index]))
    : keep.mediaIndex == null
      ? []
      : [keep.mediaIndex];
  return {
    postSourceId: postSourceId(save),
    keep,
    slides: rest,
    keepMedia,
  };
}

function matchCaptureMedia(
  primaries: readonly SaveFile[],
  media: readonly CaptureMedia[],
): (number | null)[] {
  const taken = new Set<number>();
  const claim = (match: (entry: CaptureMedia) => boolean) => {
    const index = media.findIndex(
      (entry, position) => !taken.has(position) && match(entry),
    );
    if (index === -1) return null;
    taken.add(index);
    return index;
  };
  const byUrl = primaries.map((file) =>
    file.sourceUrl ? claim((entry) => entry.url === file.sourceUrl) : null,
  );
  return primaries.map((file, index) => {
    const matched = byUrl[index];
    if (matched != null) return matched;
    const type = isVideoFile(file) ? "video" : "image";
    return claim((entry) => entry.type === type && !isAvatarUrl(entry.url));
  });
}

/** Keeps only the capture media at the given walk positions, across quoted and reply levels. */
export function retainCaptureMedia(
  capture: Capture,
  indexes: readonly number[],
): Capture {
  const media = walkCaptureMedia(capture);
  const urls = new Set(
    indexes.flatMap((index) => {
      const entry = media[index];
      return entry ? [entry.url] : [];
    }),
  );
  return filterCaptureMedia(capture, urls);
}

function filterCaptureMedia(capture: Capture, urls: Set<string>): Capture {
  const next: Capture = {
    ...capture,
    media: (capture.media ?? []).filter((entry) => urls.has(entry.url)),
  };
  if (capture.quoted) next.quoted = filterCaptureMedia(capture.quoted, urls);
  if (capture.replyTo) next.replyTo = filterCaptureMedia(capture.replyTo, urls);
  return next;
}

/** Narrows a freshly harvested post to the media a split save holds. */
export function narrowToSplit(
  raw: RawJson,
  split: RawJson["split"] | undefined,
): RawJson {
  if (!split) return raw;
  return {
    ...raw,
    capture: retainCaptureMedia(raw.capture, split.media),
    split,
  };
}

function splitRaw(
  raw: RawJson | null,
  post: string,
  media: number[],
): RawJson | null {
  if (!raw) return null;
  return {
    ...raw,
    capture: retainCaptureMedia(raw.capture, media),
    split: { sourceId: post, media },
  };
}

/** Slide Source IDs hash the file so a later sync of the post can never derive or collide with them. */
export function slideSourceIds(plan: SaveSplitPlan): string[] {
  const seen = new Set<string>();
  return plan.slides.map((slide) => {
    const base = `${plan.postSourceId} ${slide.primary.sha256.slice(0, 16) || slide.primary.path}`;
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base} ${n}`;
    seen.add(id);
    return id;
  });
}

function mediaFields(save: Save, slide: SaveSlide) {
  const index = slide.mediaIndex;
  const media =
    index == null ? undefined : walkCaptureMedia(save.rawJson?.capture)[index];
  return {
    mediaUrl: media?.url ?? slide.primary.sourceUrl ?? null,
    mediaType: slide.video ? ("video" as const) : ("image" as const),
    width: slide.primary.width ?? null,
    height: slide.primary.height ?? null,
    fileSize: slide.files.reduce((total, file) => total + file.size, 0),
  };
}

/** A model score stays until each slide is scored on its own, so a flagged slide is never shown unblurred meanwhile. */
function keptSensitivity(save: Save) {
  return {
    sensitiveScore: save.sensitiveScore,
    sensitiveModel: isManualSensitiveDecision(save.sensitiveModel)
      ? save.sensitiveModel
      : null,
  };
}

/** A slide stays `ingesting` until its files land, so an interrupted split never shows a complete save without media. */
export function buildSlideRows(
  save: Save,
  plan: SaveSplitPlan,
  newId: () => string,
  now = new Date(),
): NewSave[] {
  const sourceIds = slideSourceIds(plan);
  const localUrl = `pond:local/${save.id}`;
  return plan.slides.map((slide, index): NewSave => {
    const id = newId();
    const media = slide.mediaIndex == null ? [] : [slide.mediaIndex];
    return {
      id,
      source: save.source,
      sourceId: sourceIds[index] ?? `${plan.postSourceId} ${id}`,
      accountId: save.accountId,
      importedFrom: save.importedFrom,
      url: save.url === localUrl ? `pond:local/${id}` : save.url,
      title: save.title,
      description: save.description,
      author: save.author,
      lang: save.lang,
      siteName: save.siteName,
      publishedAt: save.publishedAt,
      notes: save.notes,
      ...mediaFields(save, slide),
      rawJson: splitRaw(save.rawJson, plan.postSourceId, media),
      tags: save.tags,
      listKinds: save.listKinds,
      files: [],
      coverIndex: 0,
      rating: save.rating,
      ...keptSensitivity(save),
      status: "ingesting",
      ingestStartedAt: now,
      ingestCompletedAt: null,
      savedAt: new Date(save.savedAt.getTime() - (index + 1)),
      createdAt: save.createdAt,
    };
  });
}

function primaryBeforeSplit(save: SplitSource): SaveFile | undefined {
  const primaries = slideFiles(save.files);
  return primaries.find((file) => isVideoFile(file)) ?? primaries[0];
}

export interface OriginalSplitPatch {
  patch: Partial<NewSave>;
  /** Files to delete from the original's folder once the patch lands. */
  removed: SaveFile[];
}

export function buildOriginalPatch(
  save: Save,
  plan: SaveSplitPlan,
): OriginalSplitPatch {
  const moved = plan.slides.flatMap((slide) =>
    slide.files.map((file) => file.path),
  );
  const sidecars = new Set(moved.flatMap(thumbnailSidecarCandidates));
  const gone = new Set(moved);
  const removed = save.files.filter(
    (file) =>
      gone.has(file.path) ||
      (isThumbnailKind(file.kind) && !file.custom && sidecars.has(file.path)),
  );
  for (const file of removed) gone.add(file.path);
  const files = save.files.filter((file) => !gone.has(file.path));
  const primaryChanged =
    primaryBeforeSplit(save)?.path !== plan.keep.primary.path;
  const cardChanged =
    pickCardFile(save.files)?.path !== pickCardFile(files)?.path;
  const patch: Partial<NewSave> = {
    files,
    coverIndex: 0,
    ...mediaFields(save, plan.keep),
    ...keptSensitivity(save),
  };
  if (cardChanged)
    Object.assign(patch, {
      blurhash: null,
      phash: null,
      dominantColors: [],
      primaryColor: null,
    } satisfies Partial<NewSave>);
  if (save.rawJson)
    patch.rawJson = splitRaw(save.rawJson, plan.postSourceId, plan.keepMedia);
  if (primaryChanged)
    Object.assign(patch, {
      embedding: null,
      embeddingModel: null,
      caption: null,
      captionModel: null,
      ocrText: null,
      ocrModel: null,
      transcript: null,
      transcriptModel: null,
      clipEmbedding: null,
      clipModel: null,
      aesthetic: null,
      aestheticModel: null,
      suggestedTags: null,
      suggestedTagsModel: null,
      rotate: 0,
      flipX: false,
      flipY: false,
      crop: null,
      metadataVersion: null,
    } satisfies Partial<NewSave>);
  return { patch, removed };
}
