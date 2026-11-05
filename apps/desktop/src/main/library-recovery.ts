import { app, dialog } from "electron";
import log from "electron-log/main.js";
import { commitLibraryPointer } from "./core/recent-libraries";
import {
  LIBRARY_METADATA_RECOVERY,
  LibraryMetadataError,
  readLibraryId,
} from "./lib/library-id";
import { checkPointerSafety } from "./lib/library-pointer";
import { appRelaunchOptions } from "./lib/relaunch";

interface OpenProblem {
  message: string;
  detail: string;
}

function metadataProblem(error: LibraryMetadataError): OpenProblem {
  return { message: error.summary, detail: LIBRARY_METADATA_RECOVERY };
}

const UNUSABLE_LIBRARY: OpenProblem = {
  message: "Couldn't open that Library.",
  detail: "Choose another Library.",
};

function checkLibrary(path: string): OpenProblem | null {
  try {
    if (readLibraryId(path) === null) return UNUSABLE_LIBRARY;
  } catch (cause) {
    if (cause instanceof LibraryMetadataError) return metadataProblem(cause);
    log.warn("[pond library-recovery] Library check failed", cause);
    return UNUSABLE_LIBRARY;
  }
  return checkPointerSafety(path).ok ? null : UNUSABLE_LIBRARY;
}

/** Without a readable Library the renderer cannot boot, so recovery runs in native dialogs and relaunches. */
export async function recoverUnreadableLibrary(
  error: LibraryMetadataError,
): Promise<void> {
  let problem = metadataProblem(error);
  for (;;) {
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: "Library can't be opened",
      message: problem.message,
      detail: problem.detail,
      buttons: ["Choose Another Library", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) {
      app.exit(0);
      return;
    }
    const picked = await dialog.showOpenDialog({
      title: "Open an Existing Pond",
      buttonLabel: "Open",
      properties: ["openFile", "openDirectory"],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) continue;
    const next = checkLibrary(path);
    if (next) {
      problem = next;
      continue;
    }
    commitLibraryPointer(path);
    const options = appRelaunchOptions();
    if (options) app.relaunch(options);
    else app.relaunch();
    app.exit(0);
    return;
  }
}
