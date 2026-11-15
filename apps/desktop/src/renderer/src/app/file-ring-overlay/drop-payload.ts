import type { FileRingOverlayDrop } from "@shared/file-ring-overlay-contracts";
import { asUrlList, filePathsFromText } from "@/features/saves/lib/url-list";

interface DroppedData {
  files: ArrayLike<File>;
  getData: (format: string) => string;
}

/** Files win over link text, matching what a drop on the Library imports. */
export function dropPayload(
  data: DroppedData,
  folderId: string,
  pathFor: (file: File) => string,
): FileRingOverlayDrop | null {
  const paths = Array.from(data.files)
    .map((file) => {
      try {
        return pathFor(file);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  if (paths.length > 0) return { kind: "files", folderId, paths };
  const text = data.getData("text/uri-list") || data.getData("text/plain");
  const textPaths = filePathsFromText(text);
  if (textPaths.length > 0)
    return { kind: "files", folderId, paths: textPaths };
  const urls = asUrlList(text);
  return urls ? { kind: "urls", folderId, urls } : null;
}
