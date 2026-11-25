import { inverse } from "@pond/schema/tx";
import type { Transaction } from "@pond/schema/tx";
import { describe, expect, it } from "vitest";
import {
  batchEditExtensions,
  planBatchExtensionEdits,
} from "./batch-extensions";
import type { BatchExtensionRuntime } from "./batch-extensions";

const rows = [
  {
    id: "one",
    title: "One",
    files: [
      {
        kind: "image",
        path: "media-0.jpg",
        sha256: "hash",
        size: 20,
        mimeType: "image/jpeg",
      },
      {
        kind: "thumbnail",
        path: "media-0_thumbnail.png",
        sha256: "thumb",
        size: 10,
        mimeType: "image/png",
      },
    ],
  },
];

describe("batch extension editing", () => {
  it("renames originals, refreshes MIME metadata, and preserves auxiliaries", () => {
    const result = planBatchExtensionEdits(rows, ".webp");
    expect(result.changedFiles).toBe(1);
    expect(result.transactions[0]).toMatchObject({
      model: "save",
      id: "one",
      fileRenames: [{ from: "media-0.jpg", to: "media-0.webp" }],
      before: { files: rows[0]?.files },
      patch: {
        files: [
          expect.objectContaining({
            path: "media-0.webp",
            mimeType: "image/webp",
          }),
          expect.objectContaining({ path: "media-0_thumbnail.png" }),
        ],
      },
    });
    const transaction = result.transactions[0];
    if (!transaction) throw new Error("Missing transaction");
    expect(inverse(transaction)).toMatchObject({
      fileRenames: [{ from: "media-0.webp", to: "media-0.jpg" }],
      patch: { files: rows[0]?.files },
    });
  });

  it("rejects manifest collisions before committing", () => {
    expect(() =>
      planBatchExtensionEdits(
        [
          {
            id: "collision",
            title: "Collision",
            files: [
              { kind: "image", path: "asset.jpg", sha256: "a", size: 1 },
              { kind: "image", path: "asset.png", sha256: "b", size: 1 },
            ],
          },
        ],
        "png",
      ),
    ).toThrow("already contains");
  });

  it("records Undo only after the transaction commits", async () => {
    const batches: Array<Array<Transaction>> = [];
    const undo: Array<Array<Transaction>> = [];
    let fail = true;
    const runtime: BatchExtensionRuntime = {
      async read() {
        return rows;
      },
      async commit(transactions) {
        if (fail) throw new Error("Disk unavailable");
        batches.push(transactions);
      },
      recordUndo(transactions) {
        undo.push(transactions);
      },
    };
    await expect(
      batchEditExtensions({ ids: ["one"], extension: "webp" }, runtime),
    ).rejects.toThrow("Disk unavailable");
    expect(undo).toEqual([]);
    fail = false;
    await expect(
      batchEditExtensions({ ids: ["one"], extension: "webp" }, runtime),
    ).resolves.toMatchObject({ changed: 1, changedFiles: 1 });
    expect(undo).toEqual(batches);
  });
});
