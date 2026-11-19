import { randomUUID } from "node:crypto";
import { clipboard, dialog } from "electron";
import {
  QUICK_CAPTURE_IPC,
  QuickCaptureDragSchema,
  type QuickCaptureResult,
  QuickCaptureSubmitSchema,
} from "../../shared/quick-capture-contracts";
import { captures } from "../core/captures";
import { listFolders } from "../core/folders";
import { getPrefs } from "../core/prefs";
import {
  closeQuickCapture,
  isQuickCaptureOpen,
  openQuickCapture,
  presentQuickCapture,
  quickCaptureOwnsSender,
  quickCaptureSnapshot,
  quickCaptureWindow,
  setQuickCaptureDrag,
  setQuickCapturePicking,
} from "../core/quick-capture-overlay";
import { quickCaptureDraft } from "../core/quick-capture-overlay/draft";
import { resolveShellHint } from "../window";
import { safeHandle } from "./helpers";

async function openWithSnapshot(): Promise<void> {
  const [prefs, folders, shell, text] = await Promise.all([
    getPrefs(),
    listFolders(),
    resolveShellHint(),
    clipboard.readText(),
  ]);
  await openQuickCapture({
    clipboard: text.slice(0, 100_000),
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      color: folder.color,
      sortOrder: folder.sortOrder,
      icon: prefs.folderViews[folder.id]?.icon,
    })),
    shell,
  });
}

export async function toggleQuickCapture(): Promise<void> {
  if (isQuickCaptureOpen()) closeQuickCapture();
  else await openWithSnapshot();
}

function assertOwner(id: number): void {
  if (!quickCaptureOwnsSender(id)) throw new Error("Not Quick Capture");
}

export function registerQuickCaptureIpc(): void {
  safeHandle(QUICK_CAPTURE_IPC.ready, (event) => {
    assertOwner(event.sender.id);
    return quickCaptureSnapshot();
  });
  safeHandle(QUICK_CAPTURE_IPC.present, (event) => {
    assertOwner(event.sender.id);
    presentQuickCapture();
  });
  safeHandle(QUICK_CAPTURE_IPC.pick, async (event) => {
    assertOwner(event.sender.id);
    const win = quickCaptureWindow();
    if (!win) return [];
    setQuickCapturePicking(true);
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile", "multiSelections"],
      });
      return result.canceled ? [] : result.filePaths;
    } finally {
      setQuickCapturePicking(false);
      if (!win.isDestroyed()) win.focus();
    }
  });
  safeHandle(
    QUICK_CAPTURE_IPC.submit,
    async (event, raw): Promise<QuickCaptureResult> => {
      assertOwner(event.sender.id);
      const input = QuickCaptureSubmitSchema.parse(raw);
      if (
        input.folderId &&
        !(await listFolders()).some((folder) => folder.id === input.folderId)
      )
        throw new Error("That folder no longer exists.");
      const draft = quickCaptureDraft(input, randomUUID());
      await captures.accept(draft);
      return { count: draft.items.length };
    },
  );
  safeHandle(QUICK_CAPTURE_IPC.drag, (event, raw) => {
    assertOwner(event.sender.id);
    setQuickCaptureDrag(QuickCaptureDragSchema.parse(raw));
  });
  safeHandle(QUICK_CAPTURE_IPC.dismiss, (event) => {
    assertOwner(event.sender.id);
    closeQuickCapture();
  });
}
