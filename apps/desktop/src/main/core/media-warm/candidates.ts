import type { Save, SaveFile } from "@pond/schema/db";
import { isStaticThumbnailFile } from "../../../shared/media-index";

export type MediaWarmCandidate =
  | { kind: "poster"; saveId: string; title: string }
  | {
      kind: "thumbnail";
      saveId: string;
      title: string;
      sourceFile: string;
      version: string | null;
    };

type CandidateSave = Pick<Save, "id" | "title" | "status" | "files">;

const NON_CARD_IMAGE_KINDS = new Set(["avatar", "source_icon"]);

/**
 * Every locally displayable still gets the same LQIP and 768px cache entries
 * the card requests. This includes gallery slides so pointer scrubbing never
 * becomes the first time their thumbnail is generated.
 */
export function mediaWarmCandidates(save: CandidateSave): MediaWarmCandidate[] {
  /** Failed legacy imports can still have valid, visible media; only skip files still being written. */
  if (save.status === "ingesting") return [];
  const files = save.files ?? [];
  let videoCount = 0;
  let posterCount = 0;
  let fallbackCover = false;
  const stills: SaveFile[] = [];
  for (const file of files) {
    if (file.kind === "video") videoCount += 1;
    const isStill = isStaticThumbnailFile(file);
    if (file.kind === "poster" && isStill) posterCount += 1;
    if (file.kind === "cover" && isStill) fallbackCover = true;
    if (isStill && !NON_CARD_IMAGE_KINDS.has(file.kind)) stills.push(file);
  }
  const title = save.title?.trim() || "Untitled save";

  const needsPoster =
    videoCount === 1
      ? posterCount === 0 && !fallbackCover
      : videoCount > 1 && posterCount < videoCount;
  if (needsPoster) return [{ kind: "poster", saveId: save.id, title }];

  const paths = new Set<string>();
  const candidates: MediaWarmCandidate[] = [];
  for (const file of stills) {
    if (paths.has(file.path)) continue;
    paths.add(file.path);
    candidates.push({
      kind: "thumbnail",
      saveId: save.id,
      title,
      sourceFile: file.path,
      version: file.sha256?.slice(0, 12) || null,
    });
  }
  return candidates;
}
