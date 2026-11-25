import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveFolders } from "@pond/schema/db";
import { inverse } from "@pond/schema/tx";
import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { eventTables, libraryTables } from "../database/tables";
import { initializePondSchema } from "../db";
import { StoredInfoDocSchema } from "../lib/library-format";
import { runRecoverableBatch } from "./batch-journal";
import {
  replaceFolderMemberships,
  writeFolderMemberships,
} from "./folder-transaction";

function nativeAvailable() {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}
const roots: Array<string> = [];
const opened: Array<Database.Database> = [];
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
  }
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe.skipIf(!nativeAvailable())("folder membership transactions", () => {
  it("writes membership sets with one undo inverse and rolls metadata back if validation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-folder-tx-"));
    roots.push(root);
    const directory = join(root, "items", "save.info");
    await mkdir(directory, { recursive: true });
    const original = StoredInfoDocSchema.parse({
      id: "save",
      source: "local",
      sourceId: "save",
      url: "",
      folderIds: ["a"],
      schema: 3,
    });
    await writeFile(join(directory, "info.json"), JSON.stringify(original));
    const sqlite = new Database(":memory:");
    opened.push(sqlite);
    initializePondSchema(sqlite, () => false);
    const db = Object.assign(
      drizzle(sqlite, { schema: { ...libraryTables, ...eventTables } }),
      { $raw: sqlite },
    );
    sqlite.exec(
      "insert into saves(id,source,source_id,url) values('save','local','save',''); insert into folders(id,name) values('a','A'),('b','B'); insert into save_folders(save_id,folder_id) values('save','a')",
    );
    const transaction: Transaction = {
      kind: "update",
      model: "save_folder",
      id: "save",
      patch: { folderIds: ["b"] },
      before: { folderIds: ["a"] },
    };
    async function commit(tx: Transaction) {
      if (tx.model !== "save_folder") {
        throw new Error("Expected membership transaction");
      }
      await runRecoverableBatch({
        root,
        batchId: crypto.randomUUID(),
        transactions: [tx],
        async applyDisk() {
          await writeFolderMemberships(tx.id, tx.patch.folderIds, directory);
        },
        commitIndex: sqlite.transaction(() =>
          replaceFolderMemberships(db, tx.id, tx.patch.folderIds),
        ),
        onCleanupError(error) {
          throw error;
        },
      });
    }
    await commit(transaction);
    expect(db.select().from(saveFolders).all()).toEqual([
      { saveId: "save", folderId: "b" },
    ]);
    await commit(inverse(transaction));
    expect(db.select().from(saveFolders).all()).toEqual([
      { saveId: "save", folderId: "a" },
    ]);
    await expect(
      commit({ ...transaction, patch: { folderIds: ["missing"] } }),
    ).rejects.toThrow("no longer exists");
    expect(db.select().from(saveFolders).all()).toEqual([
      { saveId: "save", folderId: "a" },
    ]);
    expect(
      StoredInfoDocSchema.parse(
        JSON.parse(await readFile(join(directory, "info.json"), "utf8")),
      ).folderIds,
    ).toEqual(["a"]);
  });

  it("skips a save whose info.json is not on disk yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-folder-tx-missing-"));
    roots.push(root);
    const directory = join(root, "items", "save.info");
    await mkdir(directory, { recursive: true });
    await expect(
      writeFolderMemberships("save", ["b"], directory),
    ).resolves.toBeUndefined();
  });
});
