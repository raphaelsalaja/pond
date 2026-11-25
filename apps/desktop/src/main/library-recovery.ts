import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, dialog } from "electron";
import type { OpenDialogOptions } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_LIBRARY_NAME } from "../shared/constants";
import type { MissingLibraryChoice } from "../shared/missing-library-contracts";
import { createPondBundle } from "./core/ensure-default-library";
import {
  commitLibraryPointer,
  renameRecentLibrary,
} from "./core/recent-libraries";
import { recentLibrariesFile } from "./ipc/queries/library-location-paths";
import {
  LIBRARY_METADATA_RECOVERY,
  LibraryMetadataError,
  libraryNameFromPath,
  readLibraryId,
} from "./lib/library-id";
import { checkPointerSafety } from "./lib/library-pointer";
import { normalizeLibraryPath } from "./lib/path-identity";
import { relaunchApp } from "./lib/relaunch-app";
import { openMissingLibraryWindow } from "./missing-library-window";

export interface OpenProblem {
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
    if (readLibraryId(path) === null) {
      return UNUSABLE_LIBRARY;
    }
  } catch (error) {
    if (error instanceof LibraryMetadataError) {
      return metadataProblem(error);
    }
    log.warn("[pond library-recovery] Library check failed", error);
    return UNUSABLE_LIBRARY;
  }
  return checkPointerSafety(path).ok ? null : UNUSABLE_LIBRARY;
}

function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export type { MissingLibraryChoice };

export interface MissingLibraryPorts {
  ask(detail: string): Promise<MissingLibraryChoice>;
  pick(): Promise<string | null>;
  check(path: string): OpenProblem | null;
  create(): boolean;
  adopt(missing: string, located: string): void;
  settle?(): void;
}

function windowMissingLibraryPorts(missing: string): MissingLibraryPorts {
  const name = libraryNameFromPath(missing);
  const page = openMissingLibraryWindow(name, displayPath(missing));
  return {
    ask: (detail) => page.ask(detail),
    async pick() {
      const options: OpenDialogOptions = {
        title: `Locate ${name}`,
        buttonLabel: "Open",
        properties: ["openFile", "openDirectory"],
      };
      const parent = page.window();
      const picked = await (parent
        ? dialog.showOpenDialog(parent, options)
        : dialog.showOpenDialog(options));
      const path = picked.filePaths[0];
      return picked.canceled || !path ? null : path;
    },
    check: checkLibrary,
    create() {
      const created = createPondBundle(
        join(app.getPath("home"), "Pond"),
        DEFAULT_LIBRARY_NAME,
      );
      if (!created.ok) {
        log.error("[pond library-recovery] New Library failed", created.reason);
      }
      return created.ok;
    },
    adopt(missing, located) {
      try {
        renameRecentLibrary(recentLibrariesFile(), missing, located);
      } catch (error) {
        log.warn("[pond library-recovery] Could not update recents", error);
      }
      commitLibraryPointer(located);
    },
    settle: () => page.settle(),
  };
}

/** Runs before paths resolve, since resolving a missing pointer recreates an empty Library in its place. */
export async function recoverMissingLibrary(
  missing: string,
  ports: MissingLibraryPorts = windowMissingLibraryPorts(missing),
): Promise<boolean> {
  const recovered = await recoverMissingLibraryLoop(missing, ports);
  if (recovered) ports.settle?.();
  return recovered;
}

async function recoverMissingLibraryLoop(
  missing: string,
  ports: MissingLibraryPorts,
): Promise<boolean> {
  let detail =
    "If you moved it, locate it. If it's on a drive or in iCloud, wait until it's available, then try again.";
  for (;;) {
    const choice = await ports.ask(detail);
    if (choice === "quit") return false;
    if (choice === "retry") {
      if (existsSync(missing)) return true;
      detail =
        "It's still missing. Connect the drive it's on and try again, or locate it.";
      continue;
    }
    if (choice === "new") {
      if (ports.create()) return true;
      detail = "Couldn't create a new Library. Locate an existing one instead.";
      continue;
    }
    const path = await ports.pick();
    if (!path) continue;
    const located = normalizeLibraryPath(path);
    const problem = ports.check(located);
    if (problem) {
      detail = `${problem.message} ${problem.detail}`;
      continue;
    }
    ports.adopt(missing, located);
    return true;
  }
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
    relaunchApp();
    app.quit();
    return;
  }
}
