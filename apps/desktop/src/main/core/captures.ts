import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CaptureDraft,
  CaptureMetadata,
  CaptureReceipt,
} from "@pond/schema/capture";
import { saves } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { libraryRoot } from "../paths";
import { captureAsset } from "./capture-asset";
import { applyAfterSave, createCaptureQueue } from "./capture-queue";
import { executeBatch } from "./executor";
import { emitFeedback } from "./feedback";
import { folderIdsForSave } from "./folder-memberships";
import { runLibraryTransfer } from "./library-transfers";
import { createManualSave } from "./manual-import";
import { enqueue } from "./pipeline/enqueue";
import { normalizeTagList, prepareTagRegistryUpdates } from "./tags";
import { recordBatchForUndo } from "./undo";
import { hasUserTitle } from "./user-metadata";

type CaptureItem = CaptureDraft["items"][number];

const captureCookies = new Map<string, ExtensionCookie[]>();
const completeListeners = new Set<
  (receipt: CaptureReceipt) => void | Promise<void>
>();
async function writeCaptureQueue(path: string, value: string): Promise<void> {
  await writeFile(path, value, { mode: 0o600 });
}

async function readCaptureQueue(path: string): Promise<string> {
  return readFile(path, "utf8");
}
export function attachCaptureCookies(
  id: string,
  cookies: ExtensionCookie[],
): void {
  captureCookies.set(id, cookies);
  setTimeout(() => captureCookies.delete(id), 30 * 60_000).unref();
}

export function onCaptureComplete(
  listener: (receipt: CaptureReceipt) => void | Promise<void>,
): () => void {
  completeListeners.add(listener);
  return () => completeListeners.delete(listener);
}

export const captures = createCaptureQueue({
  root: libraryRoot,
  readStored: readCaptureQueue,
  writeStored: writeCaptureQueue,
  transfer: runLibraryTransfer,
  async onComplete(receipt) {
    emitFeedback("extensionCapture");
    for (const listener of completeListeners) await listener(receipt);
  },
  async process(item, metadata, identity, originUrl, trigger) {
    let id: string;
    let duplicate = false;
    if (item.kind === "asset") {
      const result = await captureAsset({
        url: item.url,
        title: item.title,
        metadata,
        originUrl,
        cookies: captureCookies.get(
          identity.slice(0, identity.lastIndexOf(":")),
        ),
      });
      id = result.id;
      duplicate = result.duplicate;
    } else if (item.kind === "url") {
      const result = await enqueue(item.url, {
        trigger: trigger ?? "capture",
        cookies: captureCookies.get(
          identity.slice(0, identity.lastIndexOf(":")),
        ),
      });
      id = result.id;
      duplicate = !result.created && !result.restored;
    } else {
      const temp =
        item.kind === "image"
          ? await mkdtemp(join(tmpdir(), "pond-capture-"))
          : undefined;
      try {
        let filePath = item.kind === "file" ? item.path : undefined;
        if (item.kind === "image" && temp) {
          const extension = item.dataUrl.startsWith("data:image/png")
            ? "png"
            : item.dataUrl.startsWith("data:image/webp")
              ? "webp"
              : "jpg";
          filePath = join(temp, `capture.${extension}`);
          await writeFile(
            filePath,
            Buffer.from(
              item.dataUrl.slice(item.dataUrl.indexOf(",") + 1),
              "base64",
            ),
          );
        }
        const result = await createManualSave({
          title: metadata.title || item.title,
          note: item.kind === "note" ? item.text : metadata.notes,
          sourceId: `capture:${identity}`,
          url: originUrl,
          filePaths: filePath ? [filePath] : [],
          tags: metadata.tags,
          rating: metadata.rating,
          inboxChannel: "captures",
        });
        if (!result.ok) throw new Error(result.error);
        id = result.id;
        duplicate = Boolean(result.skipped);
      } finally {
        if (temp) await rm(temp, { recursive: true, force: true });
      }
    }
    const db = await getDb();
    const row = db.select().from(saves).where(eq(saves.id, id)).get();
    if (!row)
      throw new Error("The captured Save is missing. Retry this capture.");
    return applyAfterSave({ id, duplicate }, () =>
      applyCaptureMetadata(id, row, item, metadata),
    );
  },
});

async function applyCaptureMetadata(
  id: string,
  row: typeof saves.$inferSelect,
  item: CaptureItem,
  metadata: CaptureMetadata,
): Promise<void> {
  const txs: Transaction[] = await prepareTagRegistryUpdates(metadata.tags);
  const update: Extract<Transaction, { kind: "update"; model: "save" }> = {
    kind: "update",
    model: "save",
    id,
    before: { tags: row.tags },
    patch: {
      tags: normalizeTagList([...(row.tags ?? []), ...metadata.tags]),
    },
    meta: { actor: "user", actorReason: "capture:metadata" },
  };
  if (metadata.title || item.title) {
    update.patch.title = metadata.title || item.title;
    update.before.title = row.title;
  }
  if (metadata.title)
    update.titleLock = { before: hasUserTitle(id), after: true };
  if (metadata.notes) {
    update.patch.notes = metadata.notes;
    update.before.notes = row.notes;
  }
  if (metadata.rating !== undefined) {
    update.patch.rating = metadata.rating;
    update.before.rating = row.rating;
  }
  txs.push(update);
  if (metadata.folderIds.length) {
    const before = await folderIdsForSave(id);
    txs.push({
      kind: "update",
      model: "save_folder",
      id,
      patch: { folderIds: [...new Set([...before, ...metadata.folderIds])] },
      before: { folderIds: before },
      meta: { actor: "user", actorReason: "capture:folders" },
    });
  }
  await executeBatch(txs);
  recordBatchForUndo(txs);
}
