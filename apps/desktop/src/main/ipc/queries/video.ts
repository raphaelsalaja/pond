import { mkdir } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import { BrowserWindow, clipboard, dialog, nativeImage } from "electron";
import { getDb } from "../../db";
import { itemDir, itemFile } from "../../paths";
import type { QueryHandlerMap } from "../helpers";
import { toWireSave } from "../wire";

export const videoQueries: QueryHandlerMap = {
  async "video.copyFrame"(params) {
    const dataUrl = String(params.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/")) return { ok: false };
    const img = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(img);
    return { ok: true };
  },

  async "video.saveFrame"(params, event) {
    const dataUrl = String(params.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/")) return { ok: false };
    const win = event
      ? (BrowserWindow.fromWebContents(event.sender) ?? undefined)
      : undefined;
    const result = await dialog.showSaveDialog({
      ...(win ? { browserWindow: win } : {}),
      defaultPath: `frame-${Date.now()}.png`,
      filters: [{ name: "Images", extensions: ["png"] }],
    } as Electron.SaveDialogOptions);
    if (result.canceled || !result.filePath) return { ok: false };
    const img = nativeImage.createFromDataURL(dataUrl);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(result.filePath, img.toPNG());
    return { ok: true, path: result.filePath };
  },

  async "video.setThumbnail"(params) {
    const saveId = String(params.saveId ?? "");
    const dataUrl = String(params.dataUrl ?? "");
    if (!saveId || !dataUrl.startsWith("data:image/")) return { ok: false };
    const img = nativeImage.createFromDataURL(dataUrl);
    const thumbDir = resolvePath(itemDir(saveId));
    await mkdir(thumbDir, { recursive: true });
    const thumbPath = resolvePath(thumbDir, "thumb.png");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(thumbPath, img.toPNG());
    return { ok: true };
  },

  async "video.copyFilePath"(params) {
    const db = await getDb();
    const saveId = String(params.saveId ?? "");
    if (!saveId) return { ok: false };
    const rows = await db.select().from(saves).where(eq(saves.id, saveId));
    const save = rows[0];
    if (!save) return { ok: false };
    const wire = toWireSave(save);
    const f = wire.files[0];
    if (!f) return { ok: false };
    clipboard.writeText(itemFile(saveId, f.path));
    return { ok: true };
  },
};
