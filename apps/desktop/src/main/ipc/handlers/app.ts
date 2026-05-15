import { userInfo } from "node:os";
import type { Transaction } from "@pond/schema/tx";
import { app, shell } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import { executeBatch, executeTransaction } from "../../core/executor";
import { canRedo, canUndo, recordForUndo, redo, undo } from "../../core/undo";
import { resolveSaveFilePath, safeHandle } from "../helpers";

export function registerAppHandlers(): void {
  safeHandle(IPC.appInfo, () => {
    let username = "Pond";
    try {
      const raw = userInfo().username;
      if (raw) {
        username = raw
          .split(/[._-]/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      }
    } catch {
      /* fall back to default username */
    }
    return {
      name: "pond",
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      username,
    };
  });

  safeHandle(IPC.tx, async (_, tx: Transaction) => {
    const action = await executeTransaction(tx);
    recordForUndo(tx);
    return action;
  });

  safeHandle(IPC.txBatch, async (_, txs: Transaction[]) => {
    const actions = await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return actions;
  });

  safeHandle(IPC.undo, async () => {
    const ok = await undo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  safeHandle(IPC.redo, async () => {
    const ok = await redo();
    return { ok, canUndo: canUndo(), canRedo: canRedo() };
  });

  safeHandle(IPC.openExternal, async (_, url: string) => {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`refused to open non-http(s) URL: ${parsed.protocol}`);
      }
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      log.warn("[pond ipc] openExternal failed", err);
      return { ok: false };
    }
  });

  safeHandle(IPC.revealSave, async (_, id: string, fileIndex?: number) => {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) return target;
    shell.showItemInFolder(target.path);
    return { ok: true as const };
  });

  safeHandle(IPC.openSaveFile, async (_, id: string, fileIndex?: number) => {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) return target;
    const err = await shell.openPath(target.path);
    if (err) {
      log.warn("[pond ipc] openSaveFile failed", err);
      return { ok: false as const, reason: err };
    }
    return { ok: true as const };
  });
}
