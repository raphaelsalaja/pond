import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  FileRingOverlayActivate,
  FileRingOverlayDrop,
  FileRingOverlayDropResult,
  FileRingOverlaySnapshot,
} from "../shared/file-ring-overlay-contracts";

/** Sandboxed preloads can't require sibling chunks, so channels are inlined instead of imported from the shared contract. */
const FILE_RING_OVERLAY_IPC = {
  ready: "pond:file-ring-overlay-ready",
  present: "pond:file-ring-overlay-present",
  activate: "pond:file-ring-overlay-activate",
  drop: "pond:file-ring-overlay-drop",
  dismiss: "pond:file-ring-overlay-dismiss",
} as const;

const ringApi = {
  ready(): Promise<FileRingOverlaySnapshot | null> {
    return ipcRenderer.invoke(FILE_RING_OVERLAY_IPC.ready);
  },
  present(): Promise<void> {
    return ipcRenderer.invoke(FILE_RING_OVERLAY_IPC.present);
  },
  activate(target: FileRingOverlayActivate): Promise<void> {
    return ipcRenderer.invoke(FILE_RING_OVERLAY_IPC.activate, target);
  },
  drop(drop: FileRingOverlayDrop): Promise<FileRingOverlayDropResult> {
    return ipcRenderer.invoke(FILE_RING_OVERLAY_IPC.drop, drop);
  },
  dismiss(): Promise<void> {
    return ipcRenderer.invoke(FILE_RING_OVERLAY_IPC.dismiss);
  },
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld("pondRing", ringApi);
export type PondRingApi = typeof ringApi;
