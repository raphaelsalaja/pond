import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import { BrowserWindow, clipboard, Menu, shell } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import { executeTransaction } from "../../core/executor";
import { refreshSave } from "../../core/refresh";
import { recordForUndo } from "../../core/undo";
import { getDb } from "../../db";
import { itemDir, itemFile } from "../../paths";
import { safeHandle } from "../helpers";
import { toWireSave } from "../wire";

export function registerContextMenuHandler(): void {
  safeHandle(IPC.saveContextMenu, async (event, id: string) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const db = await getDb();
      const rows = await db.select().from(saves).where(eq(saves.id, id));
      const save = rows[0];
      if (!save) return { ok: false as const, reason: "not_found" };

      const wire = toWireSave(save);
      const hasFiles = Array.isArray(wire.files) && wire.files.length > 0;
      const isTrashed = Boolean(wire.deletedAt);

      const menu = Menu.buildFromTemplate([
        {
          label: "Open with Default App",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (!f) return;
            void shell.openPath(itemFile(id, f.path)).then((err) => {
              if (err) log.warn("[pond ctx] openPath failed", err);
            });
          },
        },
        {
          label:
            process.platform === "darwin"
              ? "Reveal in Finder"
              : process.platform === "win32"
                ? "Show in Explorer"
                : "Show in File Manager",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (f) shell.showItemInFolder(itemFile(id, f.path));
            else shell.showItemInFolder(itemDir(id));
          },
        },
        { type: "separator" },
        {
          label: "Copy URL",
          enabled: Boolean(wire.url),
          click: () => clipboard.writeText(wire.url ?? ""),
        },
        {
          label: "Copy File Path",
          enabled: hasFiles,
          click: () => {
            const f = wire.files[0];
            if (f) clipboard.writeText(itemFile(id, f.path));
          },
        },
        { type: "separator" },
        ...(isTrashed
          ? [
              {
                label: "Restore from Trash",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "untrash",
                      model: "save",
                      id,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] untrash failed", err);
                  }
                },
              },
              {
                label: "Delete Forever",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "purge",
                      model: "save",
                      id,
                      before: save,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] purge failed", err);
                  }
                },
              },
            ]
          : [
              {
                label: "Move to Trash",
                click: async () => {
                  try {
                    const tx: Transaction = {
                      kind: "trash",
                      model: "save",
                      id,
                    };
                    await executeTransaction(tx);
                    recordForUndo(tx);
                  } catch (err) {
                    log.warn("[pond ctx] trash failed", err);
                  }
                },
              },
            ]),
        { type: "separator" },
        {
          label: "Refresh Metadata",
          enabled: Boolean(wire.url),
          click: () => {
            void refreshSave(id).catch((err) => {
              log.warn("[pond ctx] refreshSave failed", err);
            });
          },
        },
        {
          label: "Open Original URL in Browser",
          enabled: Boolean(wire.url),
          click: () => {
            try {
              const parsed = new URL(String(wire.url ?? ""));
              if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                void shell.openExternal(parsed.toString());
              }
            } catch {
              /* malformed URL, drop silently */
            }
          },
        },
      ]);
      menu.popup({ window: win });
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] saveContextMenu failed", err);
      return { ok: false as const, reason: "internal_error" };
    }
  });
}
