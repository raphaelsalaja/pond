import { randomUUID } from "node:crypto";
import { clipboard, dialog } from "electron";
import log from "electron-log/main.js";
import {
  QUICK_CAPTURE_IPC,
  QuickCaptureDragSchema,
  QuickCaptureSubmitSchema,
} from "../../shared/quick-capture-contracts";
import type { QuickCaptureResult } from "../../shared/quick-capture-contracts";
import { userError } from "../../shared/user-error";
import { captures } from "../core/captures";
import { addSavesToFolder, listFolders } from "../core/folders";
import { getPrefs } from "../core/prefs";
import {
  closeQuickCapture,
  isQuickCaptureOpen,
  keepQuickCaptureDraft,
  keptQuickCaptureDraft,
  openQuickCapture,
  presentQuickCapture,
  quickCaptureOwnsSender,
  quickCaptureSnapshot,
  quickCaptureWindow,
  setQuickCaptureDrag,
  setQuickCapturePicking,
} from "../core/quick-capture-overlay";
import { clipboardPrefill } from "../core/quick-capture-overlay/clipboard";
import {
  keepableDraft,
  quickCapturePlan,
} from "../core/quick-capture-overlay/draft";
import { resolveSaveDrop } from "../core/save-drag-session";
import { resolveShellHint } from "../window";
import { safeHandle } from "./helpers";

async function readPrefill(): Promise<string> {
  try {
    return await clipboardPrefill(clipboard);
  } catch (error) {
    log.warn("[pond ipc] quick capture clipboard read failed", error);
    return "";
  }
}

async function openWithSnapshot(): Promise<void> {
  const [prefs, folders, shell] = await Promise.all([
    getPrefs(),
    listFolders(),
    resolveShellHint(),
  ]);
  const draft = keptQuickCaptureDraft();
  await openQuickCapture({
    clipboard: draft ? "" : await readPrefill(),
    draft,
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
  if (isQuickCaptureOpen()) {
    closeQuickCapture();
  } else {
    await openWithSnapshot();
  }
}

function assertOwner(id: number): void {
  if (!quickCaptureOwnsSender(id)) {
    throw new Error("Not Quick Capture");
  }
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
    if (!win) {
      return [];
    }
    setQuickCapturePicking(true);
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile", "multiSelections"],
      });
      return result.canceled ? [] : result.filePaths;
    } finally {
      setQuickCapturePicking(false);
      if (!win.isDestroyed()) {
        win.focus();
      }
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
      ) {
        throw userError("That folder no longer exists. Pick another folder.");
      }
      const plan = quickCapturePlan(
        input,
        randomUUID(),
        (path) => resolveSaveDrop([path])[0] ?? null,
      );
      if (!plan.draft && !input.folderId) {
        throw userError(
          "These files are already in your Library. Pick a folder to file them.",
        );
      }
      const filed = input.folderId ? plan.saveIds : [];
      if (input.folderId && filed.length) {
        await addSavesToFolder(input.folderId, filed);
      }
      if (plan.draft) {
        await captures.accept(plan.draft);
      }
      keepQuickCaptureDraft(null);
      return { count: (plan.draft?.items.length ?? 0) + filed.length };
    },
  );
  safeHandle(QUICK_CAPTURE_IPC.drag, (event, raw) => {
    assertOwner(event.sender.id);
    setQuickCaptureDrag(QuickCaptureDragSchema.parse(raw));
  });
  safeHandle(QUICK_CAPTURE_IPC.keep, (event, raw) => {
    assertOwner(event.sender.id);
    keepQuickCaptureDraft(keepableDraft(QuickCaptureSubmitSchema.parse(raw)));
  });
  safeHandle(QUICK_CAPTURE_IPC.dismiss, (event) => {
    assertOwner(event.sender.id);
    keepQuickCaptureDraft(null);
    closeQuickCapture();
  });
}
