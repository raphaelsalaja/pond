import type { FileRingOverlayDropResult } from "@shared/file-ring-overlay-contracts";
import {
  type ImportToast,
  importToast,
  UNSUPPORTED_DROP,
} from "@/features/saves/lib/import-feedback";

export interface DropStatus {
  /** Short enough for the hub under the folder name. */
  detail: string;
  announcement: ImportToast;
}

function detailFor(
  result: Extract<FileRingOverlayDropResult, { ok: true }>,
): string {
  const { kind, imported, failed } = result;
  if (imported === 0) return "Couldn't save";
  if (failed > 0) return `${imported} saved, ${failed} failed`;
  if (kind === "urls")
    return imported === 1 ? "Downloading" : `${imported} downloading`;
  return imported === 1 ? "Saved" : `${imported} saved`;
}

export function dropStatus(
  result: FileRingOverlayDropResult | null,
  folderName: string,
): DropStatus {
  if (!result)
    return { detail: "Can't import this", announcement: UNSUPPORTED_DROP };
  if (!result.ok)
    return {
      detail: "Folder missing",
      announcement: {
        title: `Couldn't save to "${folderName}"`,
        description:
          "The folder was deleted. Open the ring again and choose another.",
      },
    };
  const detail = detailFor(result);
  const { kind, imported, failed } = result;
  return {
    detail,
    announcement: importToast({ kind, imported, failed, folderName }) ?? {
      title: detail,
    },
  };
}
