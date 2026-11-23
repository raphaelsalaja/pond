import { extname } from "node:path";
import { isManualSensitiveDecision } from "@pond/schema/content-safety";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
import { labelKey } from "@pond/schema/label-name";
import { isVideoFile } from "@shared/media-index";
import { POSTER_KIND, posterFilename } from "@shared/save-file-names";
import { slideFiles } from "@shared/save-slides";

export type GroupMember = Pick<
  Save,
  | "id"
  | "source"
  | "title"
  | "notes"
  | "tags"
  | "files"
  | "rating"
  | "favorite"
  | "sensitiveScore"
  | "sensitiveModel"
  | "savedAt"
  | "status"
  | "deletedAt"
>;

export interface GroupFile {
  /** The member Save the file is copied out of. */
  from: string;
  file: SaveFile;
  /** Name the copy asks for; the writer still renames it when another member used the same name. */
  filename: string;
}

export interface GroupPlan {
  id: string;
  row: NewSave;
  files: GroupFile[];
}

export type GroupRefusal = "count" | "missing" | "busy" | "media";

interface MemberMedia {
  slides: SaveFile[];
  /** One entry per video slide, in order; undefined when that video has no poster yet. */
  posters: (SaveFile | undefined)[];
}

/** Same rule as the viewer: a harvested post's lone video shows its one image as the poster, not as a slide. */
export function memberMedia(save: Pick<Save, "source" | "files">): MemberMedia {
  const slides = slideFiles(save.files);
  const posters = save.files.filter((file) => file.kind === POSTER_KIND);
  const videos = slides.filter((file) => isVideoFile(file));
  const images = slides.filter((file) => !isVideoFile(file));
  if (videos.length === 1 && images.length === 1 && save.source !== "local")
    return { slides: videos, posters: [posters[0] ?? images[0]] };
  return { slides, posters: videos.map((_, index) => posters[index]) };
}

export function canGroupMember(save: GroupMember): GroupRefusal | null {
  if (save.deletedAt != null) return "missing";
  if (save.status !== "complete") return "busy";
  if (memberMedia(save).slides.length === 0) return "media";
  return null;
}

/** Members keep their own file order, joined in the order given; repeated files land once. */
export function groupFiles(members: readonly GroupMember[]): GroupFile[] {
  const slides: GroupFile[] = [];
  const posters: GroupFile[] = [];
  const seen = new Set<string>();
  let videos = 0;
  /** Posters pair with videos by position, so after the first video without one the poster sweep fills the rest. */
  let aligned = true;
  for (const member of members) {
    const media = memberMedia(member);
    let videoIndex = 0;
    for (const file of media.slides) {
      const video = isVideoFile(file);
      const poster = video ? media.posters[videoIndex++] : undefined;
      if (file.sha256 && seen.has(file.sha256)) continue;
      if (file.sha256) seen.add(file.sha256);
      slides.push({ from: member.id, file, filename: file.path });
      if (!video) continue;
      aligned &&= poster != null;
      if (aligned && poster)
        posters.push({
          from: member.id,
          file: { ...poster, kind: POSTER_KIND },
          filename: posterFilename(videos, extname(poster.path) || ".jpg"),
        });
      videos += 1;
    }
  }
  return [...slides, ...posters];
}

function mergedTags(members: readonly GroupMember[]): string[] {
  const tags: string[] = [];
  const keys = new Set<string>();
  for (const tag of members.flatMap((save) => save.tags ?? [])) {
    const key = labelKey(tag);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    tags.push(tag);
  }
  return tags;
}

function mergedNotes(members: readonly GroupMember[]): string | null {
  let notes: string[] = [];
  for (const note of members.map((save) => save.notes?.trim())) {
    if (!note || notes.some((kept) => kept.includes(note))) continue;
    notes = [...notes.filter((kept) => !note.includes(kept)), note];
  }
  return notes.length > 0 ? notes.join("\n\n") : null;
}

/** The strictest member decides, so grouping never unblurs a flagged image; a model score stays until the gallery is scored. */
function mergedSensitivity(members: readonly GroupMember[]) {
  let strictest: GroupMember | undefined;
  for (const save of members) {
    if (save.sensitiveScore == null) continue;
    if (
      strictest?.sensitiveScore == null ||
      save.sensitiveScore > strictest.sensitiveScore
    )
      strictest = save;
  }
  return {
    sensitiveScore: strictest?.sensitiveScore ?? null,
    sensitiveModel:
      strictest && isManualSensitiveDecision(strictest.sensitiveModel)
        ? strictest.sensitiveModel
        : null,
  };
}

function maxRating(members: readonly GroupMember[]): number | null {
  const ratings = members.flatMap((save) =>
    save.rating == null ? [] : [save.rating],
  );
  return ratings.length > 0 ? Math.max(...ratings) : null;
}

function groupTitle(members: readonly GroupMember[]): string | null {
  for (const save of members) {
    const title = save.title?.trim();
    if (title) return title;
  }
  return null;
}

/** The gallery stays `ingesting` until its files land, so an interrupted group never shows a complete Save without media. */
export function planGroup(
  members: readonly GroupMember[],
  newId: () => string,
  now = new Date(),
): GroupPlan {
  const files = groupFiles(members);
  const first = files[0]?.file;
  const id = newId();
  const savedAt = Math.max(...members.map((save) => save.savedAt.getTime()));
  return {
    id,
    files,
    row: {
      id,
      source: "local",
      sourceId: id,
      url: `pond:local/${id}`,
      title: groupTitle(members),
      description: null,
      notes: mergedNotes(members),
      mediaType: first && isVideoFile(first) ? "video" : "image",
      width: first?.width ?? null,
      height: first?.height ?? null,
      fileSize: files.reduce((total, entry) => total + entry.file.size, 0),
      tags: mergedTags(members),
      listKinds: ["saved"],
      files: [],
      coverIndex: 0,
      rating: maxRating(members),
      favorite: members.some((save) => save.favorite),
      ...mergedSensitivity(members),
      status: "ingesting",
      ingestStartedAt: now,
      ingestCompletedAt: null,
      savedAt: new Date(Number.isFinite(savedAt) ? savedAt : now.getTime()),
      createdAt: now,
    },
  };
}
