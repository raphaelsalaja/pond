import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { saves } from "@pond/schema/db";
import { count, isNotNull, isNull } from "drizzle-orm";
import { app, Menu, type NativeImage, nativeImage, Tray } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_INGEST_PORT } from "../shared/constants";
import { getDb } from "./db";
import { getIngestToken, rotateIngestToken } from "./keychain";
import { appDataRoot, libraryRoot } from "./paths";

/**
 * Tray module. Pond is a menu-bar app first -- the tray is the primary
 * surface. Clicking the icon pops a menu with:
 *
 *   - Library name + counts ("My Pond · 432 saves")
 *   - Open library window
 *   - Copy pairing token (one-click setup for the extension)
 *   - Launch at Login toggle
 *   - Quit
 *
 * Call `ensureTray({ onOpenLibrary })` from `app.whenReady()`. The
 * returned handle lets `index.ts` call `refresh()` when saves count
 * changes (on every sync action). We keep refresh cheap -- a count(*)
 * against a small SQLite DB is instant.
 */

export interface TrayHandle {
  tray: Tray;
  refresh: () => Promise<void>;
  destroy: () => void;
}

interface TrayOptions {
  onOpenLibrary: () => void | Promise<void>;
  onOpenSettings?: () => void | Promise<void>;
}

let handle: TrayHandle | null = null;

export function currentTray(): TrayHandle | null {
  return handle;
}

export async function ensureTray(opts: TrayOptions): Promise<TrayHandle> {
  if (handle) return handle;

  let tray: Tray;
  try {
    const image = loadTrayIcon();
    if (process.platform === "darwin") {
      image.setTemplateImage(true);
    }
    tray = new Tray(image);
  } catch (err) {
    log.error("[pond tray] failed to create tray", err);
    throw err;
  }
  tray.setToolTip("pond");
  log.info("[pond tray] created");

  const instance: TrayHandle = {
    tray,
    async refresh() {
      try {
        const menu = await buildMenu(opts);
        tray.setContextMenu(menu);
        const title = await buildTooltip();
        tray.setToolTip(title);
      } catch (err) {
        log.warn("[pond tray] refresh failed", err);
      }
    },
    destroy() {
      tray.destroy();
      handle = null;
    },
  };

  await instance.refresh();
  handle = instance;
  return instance;
}

async function buildTooltip(): Promise<string> {
  try {
    const db = await getDb();
    const [active] = await db
      .select({ n: count() })
      .from(saves)
      .where(isNull(saves.archivedAt));
    const libraryName =
      libraryRoot()
        .split("/")
        .pop()
        ?.replace(/\.library$/, "") ?? "Library";
    return `${libraryName} · ${active?.n ?? 0} saves`;
  } catch {
    return "pond";
  }
}

async function buildMenu(opts: TrayOptions): Promise<Menu> {
  const db = await getDb().catch(() => null);
  let active = 0;
  let archived = 0;
  if (db) {
    const [a] = await db
      .select({ n: count() })
      .from(saves)
      .where(isNull(saves.archivedAt));
    const [b] = await db
      .select({ n: count() })
      .from(saves)
      .where(isNotNull(saves.archivedAt));
    active = Number(a?.n ?? 0);
    archived = Number(b?.n ?? 0);
  }
  const libraryName =
    libraryRoot()
      .split("/")
      .pop()
      ?.replace(/\.library$/, "") ?? "Library";
  const loginItem = app.getLoginItemSettings();

  return Menu.buildFromTemplate([
    {
      label: `${libraryName} · ${active} saves${archived ? ` (${archived} archived)` : ""}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Library…",
      accelerator: "CommandOrControl+Shift+P",
      click: () => void opts.onOpenLibrary(),
    },
    {
      label: "Settings…",
      click: () => void (opts.onOpenSettings ?? opts.onOpenLibrary)(),
    },
    { type: "separator" },
    {
      label: "Copy Pairing Token",
      click: async () => {
        const { clipboard } = await import("electron");
        const token = await getIngestToken();
        if (token) {
          clipboard.writeText(pairingString(token));
        }
      },
    },
    {
      label: "Rotate Ingest Token…",
      click: async () => {
        await rotateIngestToken();
        void handle?.refresh();
      },
    },
    { type: "separator" },
    {
      label: "Launch at Login",
      type: "checkbox",
      checked: loginItem.openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
        });
      },
    },
    { type: "separator" },
    { label: `pond ${app.getVersion()}`, enabled: false },
    { label: "Quit", accelerator: "CommandOrControl+Q", role: "quit" },
  ]);
}

/**
 * Pairing string is `pond://pair?port=<port>&token=<token>`. The extension
 * popup already offers a "paste pairing link" button on empty state, so
 * the whole first-run flow is: install extension → install app → click
 * tray → "Copy Pairing Token" → paste into popup.
 */
function pairingString(token: string): string {
  const url = new URL("pond://pair");
  url.searchParams.set("port", String(DEFAULT_INGEST_PORT));
  url.searchParams.set("token", token);
  return url.toString();
}

function loadTrayIcon(): NativeImage {
  // Production builds ship the PNGs under `process.resourcesPath` via
  // electron-builder's `extraResources`. Dev builds read directly from
  // the source tree (`apps/desktop/resources/`). We look for the macOS
  // template naming first -- `trayTemplate.png` is conventionally
  // rendered by AppKit as monochrome against the menu bar, which is
  // what we want.
  const names = ["trayTemplate.png", "tray.png"];
  const roots = [
    process.resourcesPath ?? "",
    join(__dirname, "../../resources"),
    join(app.getAppPath(), "resources"),
  ].filter(Boolean);

  for (const root of roots) {
    for (const name of names) {
      const p = join(root, name);
      try {
        if (!existsSync(p)) continue;
        const img = nativeImage.createFromPath(p);
        if (img.isEmpty()) continue;
        // Electron honours a sibling `@2x` file automatically when the
        // image is loaded via a path containing the base name.
        log.info("[pond tray] loaded icon", { path: p });
        return img;
      } catch {
        /* ignore and fall through */
      }
    }
  }
  log.warn("[pond tray] no packaged icon found, drawing runtime placeholder");
  return makePlaceholderIcon();
}

/**
 * Runtime fallback for when no bundled asset is available. Draws a
 * 22×22 rounded-square "pond" mark with a central cut-out ripple, the
 * same glyph that `scripts/generate-tray-icon.mjs` produces at build
 * time. We prefer the on-disk asset for startup speed, but this keeps
 * us from shipping an invisible tray if the file is missing.
 */
function makePlaceholderIcon(): NativeImage {
  try {
    const buf = drawGlyphPng(22);
    const img = nativeImage.createFromBuffer(buf);
    if (!img.isEmpty()) return img;
  } catch (err) {
    log.warn("[pond tray] placeholder draw failed", err);
  }
  // Absolute last resort: write the PNG into userData and try once more
  // via createFromPath. An empty NativeImage renders as nothing on
  // macOS, which is exactly the "no menu-bar icon" symptom users hit.
  try {
    const fallback = join(appDataRoot(), "tray.png");
    mkdirSync(appDataRoot(), { recursive: true });
    writeFileSync(fallback, drawGlyphPng(22));
    return nativeImage.createFromPath(fallback);
  } catch {
    return nativeImage.createEmpty();
  }
}

function drawGlyphPng(size: number): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const padding = Math.round(size * (2 / 22));
  const inner = size - padding * 2;
  const radius = Math.round(inner * 0.32);
  const rippleR = Math.round(inner * 0.18);
  const cx = padding + inner / 2;
  const cy = padding + inner / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const lx = x - padding;
      const ly = y - padding;
      let inside = false;
      if (lx >= 0 && ly >= 0 && lx < inner && ly < inner) {
        const ix =
          lx < radius ? radius - lx : Math.max(0, lx - (inner - 1 - radius));
        const iy =
          ly < radius ? radius - ly : Math.max(0, ly - (inner - 1 - radius));
        inside = ix === 0 || iy === 0 || ix * ix + iy * iy <= radius * radius;
      }
      if (inside) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        if (dx * dx + dy * dy <= rippleR * rippleR) inside = false;
      }
      if (inside) {
        rgba[i + 3] = 255;
      }
    }
  }
  return encodeRgbaPng(size, size, rgba);
}

function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
