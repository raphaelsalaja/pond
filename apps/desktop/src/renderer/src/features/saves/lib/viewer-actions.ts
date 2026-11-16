import type { Prefs } from "@pond/schema/db";
import { previewMediaType } from "@shared/preview-window-contracts";
import { pickPrimaryFile } from "@/features/saves/lib/media/units";
import { openSave } from "@/features/saves/lib/save-nav";
import { selectOnlySave } from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { requestQuickPreview } from "@/features/saves/state/quick-preview";
import { errorCopy } from "@/shared/lib/error-copy";
import { IS_MAC } from "@/shared/lib/platform";
import { notify } from "@/shared/lib/toast";

type ViewerAction = Prefs["viewer"]["doubleClickAction"];

export function previewFileIndex(
  saveId: string,
  kind: "presentation" | "detached",
): number | null {
  const save = pool.get(saveId);
  if (!save) return null;
  const index = save.files.findIndex((file) => {
    const mediaType = previewMediaType(file);
    return (
      mediaType === "image" || (kind === "detached" && mediaType === "video")
    );
  });
  return index < 0 ? null : index;
}

export function openReferenceWindow(
  saveId: string,
  fileIndex: number,
  kind: "presentation" | "detached" = "detached",
): void {
  void window.pond
    .openPreviewWindow({ saveId, fileIndex, kind })
    .catch((error) =>
      notify({
        id: "preview-window",
        title: "Couldn't open this preview",
        description: errorCopy(error, "Try again."),
      }),
    );
}

export function runViewerAction(saveId: string, action: ViewerAction): void {
  if (action === "none") return;
  if (action === "open") {
    openSave(saveId);
    return;
  }
  selectOnlySave(saveId);
  if (action === "preview") {
    requestQuickPreview(saveId);
    return;
  }
  if (action === "quick-look") {
    const save = pool.get(saveId);
    const file = save ? pickPrimaryFile(save) : null;
    if (!IS_MAC || !save || !file) {
      requestQuickPreview(saveId);
      return;
    }
    void window.pond
      .query("saves.quickLook", {
        id: saveId,
        fileIndex: save.files.indexOf(file),
      })
      .then((result) => {
        if (!result.ok) requestQuickPreview(saveId);
      })
      .catch(() => requestQuickPreview(saveId));
    return;
  }
  const fileIndex = previewFileIndex(saveId, action);
  if (fileIndex === null) {
    notify({
      id: "preview-window",
      title: "This Save doesn't contain a supported preview",
    });
    return;
  }
  openReferenceWindow(saveId, fileIndex, action);
}
