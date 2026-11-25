import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  PreviewFileAction,
  PreviewFileActionResult,
  PreviewNeighborRequest,
  PreviewWindowConfigure,
  PreviewWindowState,
} from "../shared/preview-window-contracts";

const IPC = {
  previewConfigure: "pond:preview-configure",
  previewNeighborRequest: "pond:preview-neighbor-request",
  previewFileAction: "pond:preview-file-action",
  previewClose: "pond:preview-close",
  previewState: "pond:preview-state",
} as const;

const api = {
  configure(input: PreviewWindowConfigure): Promise<void> {
    return ipcRenderer.invoke(IPC.previewConfigure, input);
  },
  close(windowId: number): Promise<void> {
    return ipcRenderer.invoke(IPC.previewClose, windowId);
  },
  requestNeighbor(input: PreviewNeighborRequest): Promise<void> {
    return ipcRenderer.invoke(IPC.previewNeighborRequest, input);
  },
  fileAction(input: PreviewFileAction): Promise<PreviewFileActionResult> {
    return ipcRenderer.invoke(IPC.previewFileAction, input);
  },
  onState(callback: (state: PreviewWindowState) => void): () => void {
    const listener = (_event: IpcRendererEvent, state: PreviewWindowState) =>
      callback(state);
    ipcRenderer.on(IPC.previewState, listener);
    return () => ipcRenderer.off(IPC.previewState, listener);
  },
};

contextBridge.exposeInMainWorld("pondPreview", api);

export type PondPreviewApi = typeof api;
