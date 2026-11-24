import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inverse } from "@pond/schema/tx";
import type { Transaction } from "@pond/schema/tx";
import { afterEach, expect, it } from "vitest";
import {
  prepareBatchJournal,
  recoverBatchJournal,
  runRecoverableBatch,
} from "./batch-journal";

const roots: Array<string> = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-batch-"));
  roots.push(root);
  for (const id of ["a", "b"]) {
    await mkdir(join(root, "items", `${id}.info`), { recursive: true });
    await writeFile(
      join(root, "items", `${id}.info`, "info.json"),
      `original-${id}`,
    );
    await writeFile(
      join(root, "items", `${id}.info`, "image.jpg"),
      `original-image-${id}`,
    );
  }
  const transactions: Array<Transaction> = ["a", "b"].map((id) => ({
    kind: "update",
    model: "save",
    id,
    patch: { rating: 5 },
    before: { rating: 1 },
  }));
  const info = (id: string) => join(root, "items", `${id}.info`, "info.json");
  return { root, transactions, info };
}
it("restores successful earlier files and the partially written failing file before rejecting", async () => {
  const { root, transactions, info } = await fixture();
  let committed = false;
  await expect(
    runRecoverableBatch({
      root,
      batchId: "failure",
      transactions,
      async applyDisk(tx) {
        await writeFile(info(tx.id), "partial");
        if (tx.id === "b") {
          throw new Error("disk full");
        }
      },
      commitIndex() {
        committed = true;
      },
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("disk full");
  expect(committed).toBe(false);
  expect(await readFile(info("a"), "utf8")).toBe("original-a");
  expect(await readFile(info("b"), "utf8")).toBe("original-b");
  expect(await readdir(join(root, ".transactions"))).toEqual([]);
});
it("restores disk metadata when the SQLite transaction rejects", async () => {
  const { root, transactions, info } = await fixture();
  await expect(
    runRecoverableBatch({
      root,
      batchId: "index-failure",
      transactions,
      async applyDisk(tx) {
        await writeFile(info(tx.id), "changed");
      },
      commitIndex() {
        throw new Error("index failure");
      },
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("index failure");
  expect(await readFile(info("a"), "utf8")).toBe("original-a");
});
it("restores replaced image bytes when a compression batch cannot commit", async () => {
  const { root } = await fixture();
  const image = join(root, "items", "a.info", "image.jpg");
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { files: [] },
    before: { files: [] },
    files: [{ filename: "image.jpg", bytes: new Uint8Array([1]) }],
    beforeFiles: [{ filename: "image.jpg", bytes: new Uint8Array([2]) }],
  };
  await expect(
    runRecoverableBatch({
      root,
      batchId: "compression-failure",
      transactions: [transaction],
      async applyDisk() {
        await writeFile(image, "compressed");
      },
      commitIndex() {
        throw new Error("index failure");
      },
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("index failure");
  expect(await readFile(image, "utf8")).toBe("original-image-a");
});
it("recovers an interrupted uncommitted batch on restart and retains a committed batch", async () => {
  const { root, transactions, info } = await fixture();
  await prepareBatchJournal(root, "interrupted", transactions);
  await writeFile(info("a"), "uncommitted");
  await recoverBatchJournal(root, () => false);
  expect(await readFile(info("a"), "utf8")).toBe("original-a");
  await prepareBatchJournal(root, "committed", transactions);
  await writeFile(info("a"), "committed");
  await recoverBatchJournal(root, (id) => id === "committed");
  expect(await readFile(info("a"), "utf8")).toBe("committed");
});
it("retains recovery data when rollback fails so reopening can retry", async () => {
  const { root, transactions, info } = await fixture();
  await expect(
    runRecoverableBatch({
      root,
      batchId: "retry",
      transactions,
      async applyDisk(tx) {
        await writeFile(info(tx.id), "partial");
        await mkdir(`${info(tx.id)}.pond-restore`);
        throw new Error("disk failure");
      },
      commitIndex() {},
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("recovery could not finish");
  expect(await readdir(join(root, ".transactions"))).toEqual(["retry"]);
  await rm(`${info("a")}.pond-restore`, { recursive: true });
  await recoverBatchJournal(root, () => false);
  expect(await readFile(info("a"), "utf8")).toBe("original-a");
});
it("backs up originals for destructive transactions and removes files created by an interrupted transaction", async () => {
  const { root, info } = await fixture();
  const before = { id: "a", source: "local", sourceId: "a", url: "" } as const;
  await prepareBatchJournal(root, "purge", [
    { kind: "purge", model: "save", id: "a", before },
  ]);
  await rm(join(root, "items", "a.info"), { recursive: true });
  await recoverBatchJournal(root, () => false);
  expect(
    await readFile(join(root, "items", "a.info", "image.jpg"), "utf8"),
  ).toBe("original-image-a");
  await prepareBatchJournal(root, "new", [
    {
      kind: "create",
      model: "save",
      id: "new",
      data: { ...before, id: "new", sourceId: "new" },
    },
  ]);
  await mkdir(join(root, "items", "new.info"));
  await writeFile(info("new"), "new");
  await recoverBatchJournal(root, () => false);
  expect(await readdir(join(root, "items"))).not.toContain("new.info");
});

it("recovers title-lock sidecars together with title metadata and includes lock state in undo", async () => {
  const { root, info } = await fixture();
  const marker = join(root, "items", "a.info", "user-title.json");
  const tx: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    before: { title: "Before" },
    patch: { title: "After" },
    titleLock: { before: false, after: true },
  };
  await expect(
    runRecoverableBatch({
      root,
      batchId: "title-lock",
      transactions: [tx],
      async applyDisk() {
        await writeFile(info("a"), "new-title");
        await writeFile(marker, "locked");
      },
      commitIndex() {
        throw new Error("index failure");
      },
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("index failure");
  expect(await readFile(info("a"), "utf8")).toBe("original-a");
  await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  expect(inverse(tx)).toMatchObject({
    patch: { title: "Before" },
    titleLock: { before: true, after: false },
  });
});

it("restores the original file a failed batch moved a replacement over", async () => {
  const { root } = await fixture();
  const original = join(root, "items", "a.info", "image.jpg");
  const replacement = join(root, "replacement.jpg");
  await writeFile(replacement, "replacement");
  await expect(
    runRecoverableBatch({
      root,
      batchId: "file-move",
      transactions: [
        {
          kind: "update",
          model: "save",
          id: "a",
          patch: {},
          before: {},
          fileMoves: [{ sourcePath: replacement, filename: "image.jpg" }],
        },
      ],
      async applyDisk() {
        await rename(replacement, original);
      },
      commitIndex() {
        throw new Error("index failure");
      },
      onCleanupError(error) {
        throw error;
      },
    }),
  ).rejects.toThrow("index failure");
  expect(await readFile(original, "utf8")).toBe("original-image-a");
});
