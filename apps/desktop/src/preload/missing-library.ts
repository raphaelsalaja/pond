import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  MissingLibraryChoice,
  MissingLibraryView,
} from "../shared/missing-library-contracts";

/** Sandboxed preloads can't require sibling chunks, so channels are inlined instead of imported from the shared contract. */
const MISSING_LIBRARY_WINDOW_IPC = {
  ready: "pond:missing-library-ready",
  view: "pond:missing-library-view",
  choose: "pond:missing-library-choose",
} as const;

const api = {
  ready(): Promise<MissingLibraryView> {
    return ipcRenderer.invoke(MISSING_LIBRARY_WINDOW_IPC.ready);
  },
  choose(choice: MissingLibraryChoice): Promise<void> {
    return ipcRenderer.invoke(MISSING_LIBRARY_WINDOW_IPC.choose, choice);
  },
  onView(callback: (view: MissingLibraryView) => void): () => void {
    const listener = (_event: IpcRendererEvent, view: MissingLibraryView) =>
      callback(view);
    ipcRenderer.on(MISSING_LIBRARY_WINDOW_IPC.view, listener);
    return () => ipcRenderer.off(MISSING_LIBRARY_WINDOW_IPC.view, listener);
  },
};

contextBridge.exposeInMainWorld("pondMissingLibrary", api);
export type PondMissingLibraryApi = typeof api;
