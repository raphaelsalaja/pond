import type { Prefs } from "@pond/schema";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  CombineImagesWindowLoad,
  CombineImagesZoomAction,
} from "../shared/combine-images-contracts";
import type { QueryClient } from "../shared/query-contracts";

/** Sandboxed preloads can't require sibling chunks, so channels are inlined instead of imported from the shared contract. */
const COMBINE_IMAGES_WINDOW_IPC = {
  load: "pond:combine-images-window-load",
  ready: "pond:combine-images-window-ready",
  close: "pond:combine-images-window-close",
  resolveDrop: "pond:combine-images-window-resolve-drop",
  zoom: "pond:combine-images-window-zoom",
} as const;

const IPC = {
  query: "pond:query",
  libraryId: "pond:library-id",
  prefsChanged: "pond:prefs-changed",
} as const;

const query: QueryClient = (name, ...args) =>
  ipcRenderer.invoke(IPC.query, name, args[0]);

const api = {
  query,
  libraryId(): string {
    const value: unknown = ipcRenderer.sendSync(IPC.libraryId);
    return String(value);
  },
  onPrefsChanged(callback: (prefs: Prefs) => void): () => void {
    const listener = (_event: IpcRendererEvent, prefs: Prefs) =>
      callback(prefs);
    ipcRenderer.on(IPC.prefsChanged, listener);
    return () => ipcRenderer.off(IPC.prefsChanged, listener);
  },
};

const combineApi = {
  ready(): Promise<CombineImagesWindowLoad> {
    return ipcRenderer.invoke(COMBINE_IMAGES_WINDOW_IPC.ready);
  },
  close(): Promise<void> {
    return ipcRenderer.invoke(COMBINE_IMAGES_WINDOW_IPC.close);
  },
  onLoad(callback: (load: CombineImagesWindowLoad) => void): () => void {
    const listener = (
      _event: IpcRendererEvent,
      load: CombineImagesWindowLoad,
    ) => callback(load);
    ipcRenderer.on(COMBINE_IMAGES_WINDOW_IPC.load, listener);
    return () => ipcRenderer.off(COMBINE_IMAGES_WINDOW_IPC.load, listener);
  },
  onZoom(callback: (action: CombineImagesZoomAction) => void): () => void {
    const listener = (
      _event: IpcRendererEvent,
      action: CombineImagesZoomAction,
    ) => callback(action);
    ipcRenderer.on(COMBINE_IMAGES_WINDOW_IPC.zoom, listener);
    return () => ipcRenderer.off(COMBINE_IMAGES_WINDOW_IPC.zoom, listener);
  },
  /** Resolves files dropped from the Library window back to Save IDs. */
  resolveDrop(files: ReadonlyArray<File>): Promise<Array<string>> {
    const paths = files.map((file) => webUtils.getPathForFile(file));
    return ipcRenderer.invoke(
      COMBINE_IMAGES_WINDOW_IPC.resolveDrop,
      paths.filter(Boolean),
    );
  },
};

contextBridge.exposeInMainWorld("pond", api);
contextBridge.exposeInMainWorld("pondCombine", combineApi);
export type PondCombineApi = typeof combineApi;
