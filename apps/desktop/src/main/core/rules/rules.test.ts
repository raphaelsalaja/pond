import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SOURCE_SYNC_PREFS, saveFolders, saves } from "@pond/schema/db";
import type { RuleInput } from "@shared/rule-contracts";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db";
import { writeBundleJson } from "../../lib/library-config";
import { invalidatePaths, resolvePaths } from "../../paths";
import { assignSaveFolders } from "../folders";
import { persistSave } from "../persist-save";
import { enqueue } from "../pipeline/enqueue";
import { createAccount, getAccount } from "../sync/accounts";
import { createWatch, getWatch } from "../sync/watches";
import { previewRule, testRule } from "./inspect";
import { intakeFor, listRuns } from "./ledger";
import { migrateIncomingRules } from "./migrate-incoming";
import { isRuleChange } from "./records";
import { drainSettledSaves, runRuleEvents } from "./service";
import {
  createRule,
  deleteRule,
  duplicateRule,
  listRules,
  readRules,
  rulesFile,
  setRuleEnabled,
  writeRules,
} from "./store";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

async function folderIds(saveId: string): Promise<Array<string>> {
  const db = await getDb();
  return db
    .select({ folderId: saveFolders.folderId })
    .from(saveFolders)
    .where(eq(saveFolders.saveId, saveId))
    .all()
    .map((row) => row.folderId)
    .sort();
}

async function tagsOf(saveId: string): Promise<Array<string>> {
  const db = await getDb();
  return (
    db
      .select({ tags: saves.tags })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get()?.tags ?? []
  );
}

/** Finishes a Save the way a download does, which writes its metadata to disk. */
async function settle(saveId: string): Promise<void> {
  await persistSave(
    saveId,
    { status: "complete", ingestCompletedAt: new Date() },
    { actorReason: "pipeline:finalize", writeInfo: true },
  );
}

async function folder(id: string): Promise<void> {
  const db = await getDb();
  db.$raw
    .prepare("insert or ignore into folders(id, name) values (?, ?)")
    .run(id, id);
}

function newSaveRule(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    name: "Rule",
    enabled: true,
    trigger: {
      kind: "newSave",
      channels: ["captures", "sync", "watches", "imports"],
      ownerId: null,
    },
    conditions: { combinator: "and", rules: [] },
    actions: [{ kind: "addTags", tags: ["Filed"] }],
    ...overrides,
  };
}

function clearRules(): void {
  const shelf = readRules();
  writeRules({
    rules: [],
    unreadable: [],
    incomingMigrated: shelf.incomingMigrated,
  });
}

describe.skipIf(!nativeSqliteAvailable())("Rules", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-rules-"));
    invalidatePaths();
    resolvePaths(join(dir, "Rules.pond"), dir);
  });

  beforeEach(() => {
    clearRules();
  });

  afterAll(async () => {
    closeDb();
    invalidatePaths();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      /** Windows keeps the closed SQLite files locked until the process exits. */
      if (process.platform !== "win32") throw error;
    }
  });

  describe("store", () => {
    it("keeps entries it can't read when it writes", async () => {
      writeBundleJson(rulesFile(resolvePaths().libraryRoot), {
        version: 1,
        rules: [{ id: "future", kind: "from-a-newer-build" }],
        incomingMigrated: true,
      });
      const rule = createRule(newSaveRule({ name: "Readable" }));
      const shelf = readRules();
      expect(shelf.rules.map((entry) => entry.id)).toEqual([rule.id]);
      expect(shelf.unreadable).toEqual([
        { id: "future", kind: "from-a-newer-build" },
      ]);
      deleteRule(rule.id);
      expect(readRules().unreadable).toHaveLength(1);
    });

    it("duplicates a Rule turned off", () => {
      const rule = createRule(newSaveRule({ name: "PDFs" }));
      const copy = duplicateRule(rule.id);
      expect(copy.name).toBe("PDFs Copy");
      expect(copy.enabled).toBe(false);
      expect(duplicateRule(rule.id).name).toBe("PDFs Copy 2");
    });

    it("rejects conditions on fields processing fills later", () => {
      expect(() =>
        createRule(
          newSaveRule({
            conditions: {
              combinator: "and",
              rules: [{ field: "caption", operator: "contains", value: "cat" }],
            },
          }),
        ),
      ).toThrow();
    });
  });

  describe("new Saves", () => {
    it("files a matching Save once it settles, and only then", async () => {
      await folder("dev");
      createRule(
        newSaveRule({
          conditions: {
            combinator: "and",
            rules: [
              { field: "url", operator: "contains", value: "github.com" },
            ],
          },
          actions: [
            { kind: "addToFolder", folderId: "dev" },
            { kind: "addTags", tags: ["GitHub", "To Review"] },
          ],
        }),
      );
      const created = await enqueue("https://github.com/vercel/next.js", {
        trigger: "github:star",
      });
      await drainSettledSaves();
      expect(await folderIds(created.id)).toEqual([]);

      await settle(created.id);
      await drainSettledSaves();
      expect(await folderIds(created.id)).toEqual(["dev"]);
      expect(await tagsOf(created.id)).toEqual(["GitHub", "To Review"]);
    });

    it("skips Saves that don't match and Saves from other capture paths", async () => {
      await folder("dev2");
      createRule(
        newSaveRule({
          trigger: { kind: "newSave", channels: ["sync"], ownerId: null },
          actions: [{ kind: "addToFolder", folderId: "dev2" }],
        }),
      );
      const captured = await enqueue("https://github.com/octocat/hello-world", {
        trigger: "github:star",
      });
      await settle(captured.id);
      await drainSettledSaves();
      expect(await folderIds(captured.id)).toEqual([]);
    });

    it("runs every matching Rule, never a disabled one, and only once", async () => {
      const a = createRule(
        newSaveRule({ actions: [{ kind: "addTags", tags: ["A"] }] }),
      );
      createRule(newSaveRule({ actions: [{ kind: "addTags", tags: ["B"] }] }));
      const off = createRule(
        newSaveRule({ actions: [{ kind: "addTags", tags: ["Off"] }] }),
      );
      setRuleEnabled(off.id, false);
      const created = await enqueue("https://dribbble.com/shots/1", {
        trigger: "dribbble:like",
      });
      await settle(created.id);
      await drainSettledSaves();
      expect(await tagsOf(created.id)).toEqual(["A", "B"]);

      await drainSettledSaves();
      const db = await getDb();
      expect(
        listRuns(db.$raw, a.id).filter((run) => run.saveId === created.id),
      ).toHaveLength(1);
    });

    it("leaves a Save that failed to download alone", async () => {
      const rule = createRule(newSaveRule());
      const failed = await enqueue("https://dribbble.com/shots/failed", {
        trigger: "dribbble:like",
      });
      await persistSave(
        failed.id,
        { status: "failed" },
        { actorReason: "pipeline:failed" },
      );
      await drainSettledSaves();
      const db = await getDb();
      expect(intakeFor(db.$raw, failed.id)).toBeNull();
      expect(
        listRuns(db.$raw, rule.id).filter((run) => run.saveId === failed.id),
      ).toEqual([]);
    });

    it("isolates a Rule that fails from the ones that work", async () => {
      createRule(
        newSaveRule({
          name: "Broken",
          actions: [{ kind: "addToFolder", folderId: "missing-folder" }],
        }),
      );
      createRule(
        newSaveRule({ name: "Works", actions: [{ kind: "favorite" }] }),
      );
      const created = await enqueue("https://dribbble.com/shots/2", {
        trigger: "dribbble:like",
      });
      await settle(created.id);
      await drainSettledSaves();
      const db = await getDb();
      expect(
        db
          .select({ favorite: saves.favorite })
          .from(saves)
          .where(eq(saves.id, created.id))
          .get()?.favorite,
      ).toBe(true);
      expect(await folderIds(created.id)).toEqual([]);
    });

    it("listens only to the Account it names, resolving unowned captures like Source filing did", async () => {
      await folder("stars");
      const account = await createAccount({
        source: "github",
        handle: "octocat",
      });
      createRule(
        newSaveRule({
          trigger: {
            kind: "newSave",
            channels: ["sync", "captures"],
            ownerId: account.id,
          },
          actions: [{ kind: "addToFolder", folderId: "stars" }],
        }),
      );
      const synced = await enqueue("https://github.com/vercel/turbo", {
        trigger: "sync:github",
        accountId: account.id,
      });
      const unowned = await enqueue("https://github.com/vercel/swr", {
        trigger: "github:star",
      });
      await settle(synced.id);
      await settle(unowned.id);
      await drainSettledSaves();
      expect(await folderIds(synced.id)).toEqual(["stars"]);
      expect(await folderIds(unowned.id)).toEqual(["stars"]);

      await createAccount({ source: "github", handle: "work" });
      const ambiguous = await enqueue("https://github.com/vercel/ai", {
        trigger: "github:star",
      });
      await settle(ambiguous.id);
      await drainSettledSaves();
      expect(await folderIds(ambiguous.id)).toEqual([]);
    });
  });

  describe("folder entry", () => {
    it("runs when a Save enters the folder, and ignores its own changes", async () => {
      await folder("parent");
      const db = await getDb();
      db.$raw
        .prepare(
          "insert or ignore into folders(id, name, parent_id) values ('child', 'child', 'parent')",
        )
        .run();
      createRule({
        name: "Parent",
        enabled: true,
        trigger: {
          kind: "addedToFolder",
          folderId: "parent",
          includeSubfolders: true,
        },
        conditions: { combinator: "and", rules: [] },
        actions: [{ kind: "addTags", tags: ["Inside"] }],
      });
      const created = await enqueue("https://dribbble.com/shots/3", {
        trigger: "dribbble:like",
      });
      await settle(created.id);
      await assignSaveFolders(
        [{ saveId: created.id, folderIds: ["child"] }],
        false,
      );
      const result = await runRuleEvents([
        { kind: "addedToFolder", saveId: created.id, folderIds: ["child"] },
      ]);
      expect(await tagsOf(created.id)).toEqual(["Inside"]);
      expect(
        result?.transactions.every((tx) =>
          isRuleChange({ actorReason: tx.meta?.actorReason ?? null }),
        ),
      ).toBe(true);
    });
  });

  describe("dry runs", () => {
    it("tests and previews without writing anything", async () => {
      await folder("preview");
      const created = await enqueue("https://dribbble.com/shots/4", {
        trigger: "dribbble:like",
      });
      await settle(created.id);
      const rule = newSaveRule({
        conditions: {
          combinator: "and",
          rules: [
            {
              field: "url",
              operator: "contains",
              value: "dribbble.com/shots/4",
            },
          ],
        },
        actions: [{ kind: "addToFolder", folderId: "preview" }],
      });
      const test = await testRule(rule, created.id);
      expect(test.matched).toBe(true);
      expect(test.conditions).toEqual([{ index: 0, passed: true }]);
      expect(test.changes).toEqual([{ kind: "folder", folderId: "preview" }]);
      const preview = await previewRule(rule);
      expect(preview.matched).toBe(1);
      expect(preview.actions[0]?.wouldChange).toBe(1);
      expect(await folderIds(created.id)).toEqual([]);
    });
  });

  describe("Source filing migration", () => {
    it("turns incoming filing into Rules once and clears it", async () => {
      await folder("kept");
      writeRules({ rules: [], unreadable: [], incomingMigrated: false });
      const account = await createAccount({
        source: "dribbble",
        handle: "studio",
        sync: {
          ...DEFAULT_SOURCE_SYNC_PREFS,
          incoming: { folderId: "kept", tags: ["Design"] },
        },
      });
      const watch = await createWatch({ source: "youtube", handle: "channel" });
      expect(await migrateIncomingRules()).toBe(1);
      const [rule] = listRules();
      expect(rule?.trigger).toEqual({
        kind: "newSave",
        channels: ["captures", "sync", "watches", "imports"],
        ownerId: account.id,
      });
      expect(rule?.actions).toEqual([
        { kind: "addToFolder", folderId: "kept" },
        { kind: "addTags", tags: ["Design"] },
      ]);
      expect((await getAccount(account.id))?.sync.incoming).toBeUndefined();
      expect((await getWatch(watch.id))?.sync.incoming).toBeUndefined();
      expect(await migrateIncomingRules()).toBe(0);
      expect(listRules()).toHaveLength(1);
    });
  });
});
