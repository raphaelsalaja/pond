import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  QuickCaptureResult,
  QuickCaptureSnapshot,
  QuickCaptureSubmit,
} from "../shared/quick-capture-contracts";

/** Sandboxed preloads can't require sibling chunks, so channels are inlined instead of imported from the shared contract. */
const QUICK_CAPTURE_IPC = {
  ready: "pond:quick-capture-ready",
  present: "pond:quick-capture-present",
  pick: "pond:quick-capture-pick",
  submit: "pond:quick-capture-submit",
  dismiss: "pond:quick-capture-dismiss",
} as const;

const captureApi = {
  ready(): Promise<QuickCaptureSnapshot | null> {
    return ipcRenderer.invoke(QUICK_CAPTURE_IPC.ready);
  },
  present(): Promise<void> {
    return ipcRenderer.invoke(QUICK_CAPTURE_IPC.present);
  },
  pick(): Promise<string[]> {
    return ipcRenderer.invoke(QUICK_CAPTURE_IPC.pick);
  },
  submit(input: QuickCaptureSubmit): Promise<QuickCaptureResult> {
    return ipcRenderer.invoke(QUICK_CAPTURE_IPC.submit, input);
  },
  dismiss(): Promise<void> {
    return ipcRenderer.invoke(QUICK_CAPTURE_IPC.dismiss);
  },
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld("pondCapture", captureApi);
export type PondCaptureApi = typeof captureApi;
