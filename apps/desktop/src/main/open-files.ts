import { extname } from "node:path";
import { IPC } from "../shared/constants";

let pendingPaths: Array<string> = [];

interface OpenFilesWindow {
  isDestroyed(): boolean;
  webContents: {
    isLoading(): boolean;
    send(channel: string, paths: Array<string>): void;
    once(event: "did-finish-load", listener: () => void): void;
  };
}

export function queueOpenFile(path: string): void {
  pendingPaths.push(path);
}

/** Finder emits one open-file per item, so a flush sends everything queued as one import. */
export async function flushOpenFiles(deps: {
  openLibraryWindow: () => Promise<void>;
  getMainWindow: () => OpenFilesWindow | null;
}): Promise<void> {
  /** @todo Open a .pond Library instead of skipping it once the Dock can switch Libraries. */
  const paths = pendingPaths.filter(
    (path) => extname(path).toLowerCase() !== ".pond",
  );
  pendingPaths = [];
  if (paths.length === 0) {
    return;
  }
  await deps.openLibraryWindow();
  const win = deps.getMainWindow();
  if (!win || win.isDestroyed()) {
    return;
  }
  const send = () => win.webContents.send(IPC.openFiles, paths);
  /** A window that is still loading cannot receive IPC. */
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}
