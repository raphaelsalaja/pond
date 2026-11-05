import { type FSWatcher, watch } from "node:fs";
import log from "electron-log/main.js";
import {
  onLibraryDisplaced,
  refreshLibraryPlacement,
} from "../lib/library-placement";
import { libraryRoot } from "../paths";
import { reconcileLibrary } from "./scan";

const WATCH_INTERVAL_MS = 5_000;

/** Notice when the open library folder disappears or is replaced while Pond is running. */
export function startLibraryDisplacementWatch(): () => void {
  let watcher: FSWatcher | null = null;
  let awaitingReturn = false;
  let warned = false;
  const stopNotices = onLibraryDisplaced(() => {
    awaitingReturn = true;
    void reconcileLibrary().catch((error) =>
      log.warn("[pond library] couldn't mark saves with missing files", error),
    );
  });

  const check = (): void => {
    const root = libraryRoot();
    const placement = refreshLibraryPlacement(root);
    if (placement === "present" && awaitingReturn) {
      awaitingReturn = false;
      void reconcileLibrary().catch((error) =>
        log.warn(
          "[pond library] couldn't restore saves after the folder returned",
          error,
        ),
      );
    }
    if (!watcher && placement !== "missing") arm();
  };

  const arm = (): void => {
    watcher?.close();
    watcher = null;
    try {
      watcher = watch(libraryRoot(), () => check());
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
      warned = false;
    } catch (error) {
      if (!warned) {
        warned = true;
        log.warn("[pond library] displacement watch unavailable", error);
      }
    }
  };

  arm();
  check();
  const timer = setInterval(check, WATCH_INTERVAL_MS);
  timer.unref();
  return () => {
    stopNotices();
    watcher?.close();
    clearInterval(timer);
  };
}
