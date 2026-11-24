import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaptureReceiptSchema } from "@pond/schema/capture";
import type { CaptureReceipt, CaptureWebDraft } from "@pond/schema/capture";
import { saves } from "@pond/schema/db";
import type { NativeResponse } from "@pond/schema/native";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeBatch } from "../core/executor";
import { createManualSave } from "../core/manual-import";
import { enqueue } from "../core/pipeline/enqueue";
import { undo } from "../core/undo";
import { closeDb, getDb } from "../db";
import { invalidatePaths, resolvePaths } from "../paths";
import { liveNativePorts } from "./ports";
import { dispatchNative } from "./rpc";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

const PAGE = "https://example.com/articles/trash-resave";

async function row(id: string) {
  const db = await getDb();
  return db.select().from(saves).where(eq(saves.id, id)).get();
}

async function trash(id: string) {
  await executeBatch([
    {
      kind: "trash",
      model: "save",
      id,
      meta: { actor: "user", actorReason: "test:trash" },
    },
  ]);
}

/** The extension sends `capture.accept`, then polls `capture.status` until it settles. */
async function saveFromExtension(
  draftId: string,
  item: CaptureWebDraft["items"][number],
  tags: Array<string> = [],
): Promise<CaptureReceipt> {
  const ports = liveNativePorts();
  const accepted: NativeResponse = await dispatchNative(
    {
      type: "capture.accept",
      draft: {
        id: draftId,
        trigger: "action",
        originUrl: PAGE,
        items: [item],
        metadata: { tags, folderIds: [] },
      },
    },
    ports,
  );
  expect(accepted.ok).toBe(true);
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await dispatchNative(
      { type: "capture.status", id: draftId },
      ports,
    );
    if (!status.ok) {
      throw new Error(`capture.status failed: ${status.error}`);
    }
    const receipt = CaptureReceiptSchema.parse(status.data);
    if (receipt.state !== "accepted" && receipt.state !== "processing") {
      return receipt;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error("capture never settled");
}

describe.skipIf(!nativeSqliteAvailable())(
  "re-saving a Save that is in Trash",
  () => {
    let dir = "";

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "pond-trash-resave-"));
      invalidatePaths();
      resolvePaths(join(dir, "Trash Resave.pond"), dir);
    });

    afterAll(() => {
      closeDb();
      invalidatePaths();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        /** Pond keeps `global.db` open until the process ends, and Windows can't delete an open file. */
        if (process.platform !== "win32") {
          throw error;
        }
      }
    });

    it("restores the page when the extension saves it again", async () => {
      const page = { kind: "url", url: PAGE, title: "Trash resave" } as const;
      const first = await saveFromExtension("first-save", page);
      expect(first).toMatchObject({ state: "complete", duplicateCount: 0 });
      const [saveId] = first.saveIds;
      if (!saveId) {
        throw new Error("first save returned no Save");
      }
      const savedAt = (await row(saveId))?.savedAt;

      await trash(saveId);
      expect((await row(saveId))?.deletedAt).toBeInstanceOf(Date);

      const again = await saveFromExtension("save-again", page, ["resaved"]);

      expect(again).toMatchObject({
        state: "complete",
        saveIds: [saveId],
        duplicateCount: 0,
      });
      const restored = await row(saveId);
      expect(restored?.deletedAt).toBeNull();
      expect(restored?.savedAt).toEqual(savedAt);
      expect(restored?.tags).toContain("resaved");
    });

    it("restores an image when the extension saves it again", async () => {
      const image = "https://example.com/media/trash-resave.png";
      const file = join(dir, "trash-resave.png");
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#4b7bec" },
      })
        .png()
        .toFile(file);
      const first = await createManualSave({
        source: "web",
        sourceId: `asset:${createHash("sha256").update(image).digest("hex")}`,
        url: PAGE,
        filePaths: [file],
        fileSourceUrls: [image],
      });
      if (!first.ok) {
        throw new Error(first.error);
      }
      await trash(first.id);

      const again = await saveFromExtension("image-again", {
        kind: "asset",
        url: image,
      });

      expect(again).toMatchObject({
        state: "complete",
        saveIds: [first.id],
        duplicateCount: 0,
      });
      expect((await row(first.id))?.deletedAt).toBeNull();
    });

    it("restores a pasted link as one Undo step", async () => {
      const url = "https://example.com/articles/trash-resave-paste";
      const first = await enqueue(url, { trigger: "user:quickAdd" });
      expect(first.created).toBe(true);
      await trash(first.id);

      const again = await enqueue(url, { trigger: "user:quickAdd" });

      expect(again).toEqual({ id: first.id, created: false, restored: true });
      expect((await row(first.id))?.deletedAt).toBeNull();
      expect(await undo()).toBe(true);
      expect((await row(first.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it("keeps a Save in Trash when a sync or watch lists it again", async () => {
      const url = "https://example.com/articles/trash-resave-sync";
      const first = await enqueue(url, { trigger: "user:quickAdd" });
      await trash(first.id);

      for (const trigger of ["sync:twitter", "watch:pinterest"]) {
        expect(await enqueue(url, { trigger })).toEqual({
          id: first.id,
          created: false,
        });
        expect((await row(first.id))?.deletedAt).toBeInstanceOf(Date);
      }
    });
  },
);
