import { basename, dirname, extname } from "node:path";
import { type SaveFile, saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  type IpcMain,
  type IpcMainInvokeEvent,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import { z } from "zod";
import { IPC } from "../../shared/constants";
import {
  type PreviewFileAction,
  type PreviewFileActionResult,
  PreviewFileActionSchema,
  type PreviewNeighborRequest,
  PreviewNeighborRequestSchema,
  type PreviewWindowConfigure,
  PreviewWindowConfigureSchema,
  type PreviewWindowNavigate,
  PreviewWindowNavigateSchema,
  type PreviewWindowOpen,
  PreviewWindowOpenSchema,
  type PreviewWindowState,
  previewMediaProfile,
} from "../../shared/preview-window-contracts";
import { userError } from "../../shared/user-error";
import { getDb } from "../db";
import { isTrustedSender, resolveSaveFilePath } from "../ipc/helpers";
import { toWireSave } from "../ipc/wire";
import {
  detachedWindowChrome,
  detachedWindowTitle,
} from "../lib/detached-window-chrome";
import { openSavedFile } from "../lib/open-saved-file";
import { resolveMainOut, resolvePreload } from "../lib/resolve-preload";
import { mainWindowState } from "../window-state";
import { copyExportFile } from "./export-files";
import { getPrefs, subscribePrefs } from "./prefs";

interface PreviewEntry {
  window: BrowserWindow;
  state: PreviewWindowState;
}

const entries = new Map<number, PreviewEntry>();
let libraryGeneration = 0;
const PreviewWindowIdSchema = z.number().int().positive();
const PREVIEW_ZOOM_RATIOS = [5, 10, 25, 50, 100, 200, 400, 800] as const;

export type PreviewContextMenuItem =
  | { type: "separator" }
  | {
      label: string;
      checked?: boolean;
      action:
        | { kind: "zoom"; zoom: number | null }
        | { kind: "configure"; patch: PreviewWindowConfigure }
        | { kind: "neighbor"; delta: -1 | 1 }
        | { kind: "close" };
    };

export function buildPreviewContextMenuItems(
  state: PreviewWindowState,
): PreviewContextMenuItem[] {
  const imageItems: PreviewContextMenuItem[] = [
    {
      label: "Fit",
      checked: state.zoom === null,
      action: { kind: "zoom", zoom: null },
    },
    ...PREVIEW_ZOOM_RATIOS.map(
      (percent): PreviewContextMenuItem => ({
        label: `${percent}%`,
        checked: Math.round((state.zoom ?? 0) * 100) === percent,
        action: { kind: "zoom", zoom: percent / 100 },
      }),
    ),
    { type: "separator" },
    {
      label: "Mirror",
      checked: state.mirrored,
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, mirrored: !state.mirrored },
      },
    },
    {
      label: "Grayscale",
      checked: state.grayscale,
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, grayscale: !state.grayscale },
      },
    },
  ];
  const videoItems: PreviewContextMenuItem[] = [
    {
      label: "Fit",
      checked: state.size === "fit",
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, size: "fit" },
      },
    },
    {
      label: "Fill",
      checked: state.size === "fill",
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, size: "fill" },
      },
    },
  ];
  return [
    ...(state.mediaType === "image" ? imageItems : videoItems),
    {
      label: "Fullscreen",
      checked: state.fullscreen,
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, fullscreen: !state.fullscreen },
      },
    },
    {
      label: "Keep on Top",
      checked: state.alwaysOnTop,
      action: {
        kind: "configure",
        patch: { windowId: state.windowId, alwaysOnTop: !state.alwaysOnTop },
      },
    },
    { type: "separator" },
    {
      label: "Previous",
      action: { kind: "neighbor", delta: -1 },
    },
    {
      label: "Next",
      action: { kind: "neighbor", delta: 1 },
    },
    { type: "separator" },
    { label: "Close", action: { kind: "close" } },
  ];
}

type PreviewTarget = Pick<
  PreviewWindowState,
  "title" | "url" | "originalPath" | "mediaType" | "source"
>;

export function previewTargetForFile(input: {
  saveId: string;
  title: string | null;
  file: Pick<SaveFile, "kind" | "path" | "mimeType">;
  kind: PreviewWindowOpen["kind"];
}): PreviewTarget | null {
  const profile = previewMediaProfile(input.file);
  if (
    !profile ||
    (input.kind === "presentation" && profile.mediaType !== "image")
  ) {
    return null;
  }
  return {
    title: input.title || input.file.path,
    url: `pond://${input.saveId}/${encodeURIComponent(input.file.path).replace(/%2F/gi, "/")}`,
    originalPath: input.file.path,
    ...profile,
  };
}

async function resolvePreviewTarget(
  saveId: string,
  fileIndex: number,
  kind: PreviewWindowOpen["kind"],
): Promise<PreviewTarget> {
  const db = await getDb();
  const row = db.select().from(saves).where(eq(saves.id, saveId)).get();
  if (!row) throw userError("The Save no longer exists.");
  const save = toWireSave(row);
  const file = save.files[fileIndex];
  if (!file) throw userError("The file no longer exists.");
  const previewTarget = previewTargetForFile({
    saveId,
    title: save.title,
    file,
    kind,
  });
  if (!previewTarget)
    throw userError("This file cannot open in a preview window.");
  const target = await resolveSaveFilePath(saveId, fileIndex);
  if (!target.ok) throw userError("The original file is unavailable.");
  return previewTarget;
}

function sendState(entry: PreviewEntry): void {
  if (!entry.window.isDestroyed()) {
    entry.window.webContents.send(IPC.previewState, entry.state);
  }
}

async function createPreviewWindow(
  input: PreviewWindowOpen,
): Promise<{ windowId: number }> {
  const generation = libraryGeneration;
  const target = await resolvePreviewTarget(
    input.saveId,
    input.fileIndex,
    input.kind,
  );
  const prefs = await getPrefs();
  if (generation !== libraryGeneration) throw userError("The Library changed.");
  const presentation = input.kind === "presentation";
  const options: BrowserWindowConstructorOptions = {
    title: detachedWindowTitle(target.title),
    width: presentation ? 1280 : 720,
    height: presentation ? 800 : 560,
    minWidth: 320,
    minHeight: 240,
    show: false,
    frame: false,
    fullscreenable: true,
    alwaysOnTop: !presentation,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreload("preview.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  };
  if (!presentation) Object.assign(options, detachedWindowChrome());
  const window = new BrowserWindow(options);
  const state: PreviewWindowState = {
    windowId: window.id,
    saveId: input.saveId,
    fileIndex: input.fileIndex,
    kind: input.kind,
    title: target.title,
    reduceMotion: prefs.preferences.reduceMotion,
    url: target.url,
    originalPath: target.originalPath,
    mediaType: target.mediaType,
    source: target.source,
    fullscreen: presentation,
    opacity: 1,
    alwaysOnTop: !presentation,
    rotation: 0,
    mirrored: false,
    grayscale: false,
    size: "fit",
    zoom: null,
  };
  const entry = { window, state };
  entries.set(window.id, entry);
  window.on("closed", () => entries.delete(window.id));
  const updateFullscreen = () => {
    entry.state = { ...entry.state, fullscreen: window.isFullScreen() };
    sendState(entry);
  };
  window.on("enter-full-screen", updateFullscreen);
  window.on("leave-full-screen", updateFullscreen);
  window.once("ready-to-show", () => {
    if (presentation) window.setFullScreen(true);
    window.show();
  });
  window.webContents.on("did-finish-load", () => {
    window.webContents.setZoomFactor(prefs.window.interfaceZoom / 100);
    sendState(entry);
  });
  window.webContents.on("context-menu", (event) => {
    event.preventDefault();
    showPreviewContextMenu(entry);
  });

  try {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl)
      await window.loadURL(`${devUrl.replace(/\/$/, "")}/preview.html`);
    else await window.loadFile(resolveMainOut("../renderer/preview.html"));
    return { windowId: window.id };
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

function configurePreviewWindow(input: PreviewWindowConfigure): void {
  const entry = entries.get(input.windowId);
  if (!entry || entry.window.isDestroyed())
    throw userError("The preview window closed.");
  entry.state = { ...entry.state, ...input };
  if (input.fullscreen !== undefined)
    entry.window.setFullScreen(input.fullscreen);
  if (input.opacity !== undefined) entry.window.setOpacity(input.opacity);
  if (input.alwaysOnTop !== undefined)
    entry.window.setAlwaysOnTop(input.alwaysOnTop);
  if (input.zoom !== undefined) {
    entry.state.size = input.zoom === null ? "fit" : "actual";
  }
  sendState(entry);
}

function showPreviewContextMenu(entry: PreviewEntry): void {
  const run = (
    item: Exclude<PreviewContextMenuItem, { type: "separator" }>,
  ) => {
    const action = item.action;
    if (action.kind === "zoom") {
      configurePreviewWindow({
        windowId: entry.state.windowId,
        zoom: action.zoom,
      });
      return;
    }
    if (action.kind === "configure") {
      configurePreviewWindow(action.patch);
      return;
    }
    if (action.kind === "neighbor") {
      mainWindowState.current?.webContents.send(IPC.previewNeighborRequest, {
        windowId: entry.state.windowId,
        saveId: entry.state.saveId,
        delta: action.delta,
        kind: entry.state.kind,
      } satisfies PreviewNeighborRequest);
      return;
    }
    closePreviewWindow(entry.state.windowId);
  };
  const template = buildPreviewContextMenuItems(entry.state).map(
    (item): MenuItemConstructorOptions =>
      "type" in item
        ? { type: "separator" }
        : {
            label: item.label,
            type: item.checked === undefined ? "normal" : "checkbox",
            checked: item.checked,
            click: () => run(item),
          },
  );
  Menu.buildFromTemplate(template).popup({ window: entry.window });
}

async function navigatePreviewWindow(
  input: PreviewWindowNavigate,
): Promise<void> {
  const entry = entries.get(input.windowId);
  if (!entry || entry.window.isDestroyed())
    throw userError("The preview window closed.");
  const target = await resolvePreviewTarget(
    input.saveId,
    input.fileIndex,
    entry.state.kind,
  );
  if (entries.get(input.windowId) !== entry || entry.window.isDestroyed())
    return;
  entry.state = {
    ...entry.state,
    saveId: input.saveId,
    fileIndex: input.fileIndex,
    title: target.title,
    url: target.url,
    originalPath: target.originalPath,
    mediaType: target.mediaType,
    source: target.source,
    zoom: null,
    size: "fit",
    rotation: 0,
    mirrored: false,
    grayscale: false,
  };
  sendState(entry);
}

async function runPreviewFileAction(
  event: IpcMainInvokeEvent,
  input: PreviewFileAction,
): Promise<PreviewFileActionResult> {
  const entry = entries.get(input.windowId);
  if (
    !entry ||
    entry.window.isDestroyed() ||
    event.sender.id !== entry.window.webContents.id
  ) {
    throw userError("The preview window closed.");
  }
  const target = await resolveSaveFilePath(
    entry.state.saveId,
    entry.state.fileIndex,
  );
  if (!target.ok) {
    return {
      ok: false,
      error: "The original file is unavailable.",
    };
  }

  if (input.action === "open") {
    const error = await openSavedFile(target.path, shell);
    return error ? { ok: false, error } : { ok: true };
  }

  const extension = extname(target.path);
  const base = (
    entry.state.title || basename(entry.state.originalPath, extension)
  )
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const picked = await dialog.showSaveDialog(entry.window, {
    defaultPath: `${base || "save"}${extension}`,
  });
  if (picked.canceled || !picked.filePath)
    return { ok: false, reason: "cancelled" };
  try {
    await copyExportFile(
      target.path,
      dirname(picked.filePath),
      basename(picked.filePath),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not export this file.",
    };
  }
}

function requestPreviewNeighbor(
  event: IpcMainInvokeEvent,
  input: PreviewNeighborRequest,
): void {
  const entry = entries.get(input.windowId);
  if (
    !entry ||
    entry.window.isDestroyed() ||
    event.sender.id !== entry.window.webContents.id
  )
    throw userError("The preview window closed.");
  mainWindowState.current?.webContents.send(IPC.previewNeighborRequest, {
    ...input,
    saveId: entry.state.saveId,
    kind: entry.state.kind,
  });
}

function closePreviewWindow(windowId: PreviewWindowState["windowId"]): void {
  entries.get(windowId)?.window.close();
}

export function closePreviewWindows(): void {
  libraryGeneration++;
  for (const entry of entries.values()) {
    if (!entry.window.isDestroyed()) entry.window.close();
  }
  entries.clear();
}

export function registerPreviewWindowHandlers(bus: IpcMain): void {
  subscribePrefs((prefs) => {
    for (const entry of entries.values()) {
      if (entry.window.isDestroyed()) continue;
      entry.state = {
        ...entry.state,
        reduceMotion: prefs.preferences.reduceMotion,
      };
      entry.window.webContents.setZoomFactor(prefs.window.interfaceZoom / 100);
      sendState(entry);
    }
  });
  bus.handle(IPC.previewOpen, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    return createPreviewWindow(PreviewWindowOpenSchema.parse(raw));
  });
  bus.handle(IPC.previewConfigure, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    configurePreviewWindow(PreviewWindowConfigureSchema.parse(raw));
  });
  bus.handle(IPC.previewNavigate, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    return navigatePreviewWindow(PreviewWindowNavigateSchema.parse(raw));
  });
  bus.handle(IPC.previewNeighborRequest, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    requestPreviewNeighbor(event, PreviewNeighborRequestSchema.parse(raw));
  });
  bus.handle(IPC.previewFileAction, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    return runPreviewFileAction(event, PreviewFileActionSchema.parse(raw));
  });
  bus.handle(IPC.previewClose, (event, raw) => {
    if (!isTrustedSender(event)) throw new Error("untrusted sender");
    closePreviewWindow(PreviewWindowIdSchema.parse(raw));
  });
}
