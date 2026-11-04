import { isVideoFile } from "./media-index";
import { IMAGE_KIND, isAuxiliaryKind } from "./save-file-names";

interface SlideFileLike {
  kind: string;
  path: string;
  mimeType?: string | null;
}

/** Original images and videos in file order, one per slide of a multi-media post. */
export function slideFiles<T extends SlideFileLike>(files: readonly T[]): T[] {
  return files.filter(
    (file) =>
      !isAuxiliaryKind(file.kind) &&
      (file.kind === IMAGE_KIND || isVideoFile(file)),
  );
}

export function canSplitFiles(files: readonly SlideFileLike[]): boolean {
  return slideFiles(files).length > 1;
}
