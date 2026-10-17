const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("guide", {
  state: () => ipcRenderer.invoke("guide:state"),
  signIn: (source) => ipcRenderer.invoke("guide:sign-in", source),
  importSession: (source) => ipcRenderer.invoke("guide:import-session", source),
  syncNow: (source) => ipcRenderer.invoke("guide:sync-now", source),
  check: (stepId) => ipcRenderer.invoke("guide:check", stepId),
  record: (stepId, verdict, note) =>
    ipcRenderer.invoke("guide:record", stepId, verdict, note),
});
