import type { ImageContent } from "@modelcontextprotocol/server";
import type { ApiThumbnailSize } from "@pond/schema/api";
import type { SaveFile } from "@pond/schema/db";
import { savePreviewFile } from "../../save-preview-file";
import { readLibraryMedia } from "../../storage/library-media-storage";

export type PreviewSize = Exclude<ApiThumbnailSize, "original">;

export async function savePreview(
  save: { id: string; files: Array<SaveFile> },
  size: PreviewSize,
): Promise<ImageContent | null> {
  try {
    const { path, type } = await savePreviewFile(save.id, save.files, size);
    const bytes = await readLibraryMedia(path);
    return {
      type: "image",
      data: bytes.toString("base64"),
      mimeType: type,
    };
  } catch {
    return null;
  }
}
