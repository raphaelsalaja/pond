import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transaction } from "@pond/schema/tx";
import { afterEach, describe, expect, it } from "vitest";
import { mergeDuplicateSaves, undoDuplicateMerge } from "./merge-duplicates";
import type { DuplicateMergeRuntime } from "./merge-duplicates";

type MergeRow = Awaited<ReturnType<DuplicateMergeRuntime["read"]>>[number];
const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-merge-test-"));
  roots.push(root);
  const rows = new Map<string, MergeRow>();
  const memberships = new Map<string, Array<string>>();
  const commits: Array<Array<Transaction>> = [];
  for (const id of ["keep", "extra"]) {
    await mkdir(join(root, id));
    await writeFile(join(root, id, "photo.jpg"), "same image");
    rows.set(id, {
      id,
      tags: id === "keep" ? ["Design"] : ["design", "Type"],
      deletedAt: null,
      files: [{ kind: "cover", path: "photo.jpg", sha256: "same", size: 10 }],
      fileSize: 10,
      notes: id === "keep" ? "Review" : "Review\n\nFrom the duplicate",
    });
    memberships.set(id, [id === "keep" ? "folder-a" : "folder-b"]);
  }
  const extra = rows.get("extra");
  if (!extra) throw new Error("Missing test Save.");
  await writeFile(join(root, "extra", "clip.mp4"), "extra video");
  extra.files.push({
    kind: "video",
    path: "clip.mp4",
    sha256: "video",
    size: 11,
  });
  const runtime: DuplicateMergeRuntime = {
    async read(ids) {
      return ids.flatMap((id) => {
        const row = rows.get(id);
        return row ? [row] : [];
      });
    },
    directory: (id) => join(root, id),
    async folders(id) {
      return memberships.get(id) ?? [];
    },
    async setFolders(id, ids) {
      memberships.set(id, ids);
      return { ok: true };
    },
    async commit(transactions) {
      for (const tx of transactions) {
        if (tx.model !== "save") throw new Error("Unexpected transaction.");
        const row = rows.get(tx.id);
        if (!row) throw new Error("Missing Save.");
        if (tx.kind === "update") Object.assign(row, tx.patch);
        else if (tx.kind === "trash") row.deletedAt = new Date();
        else if (tx.kind === "untrash") row.deletedAt = null;
        else throw new Error("Unexpected mutation.");
      }
      commits.push(transactions);
    },
  };
  return { root, rows, memberships, commits, runtime };
}

describe("merge duplicates", () => {
  it("undo restores the survivor's exact metadata and folder memberships and restores extras", async () => {
    const { rows, memberships, runtime } = await fixture();
    const original = structuredClone(rows.get("keep"));
    const result = await mergeDuplicateSaves(
      { keepId: "keep", ids: ["extra"] },
      runtime,
    );
    if (!result.receipt) throw new Error("Missing merge receipt.");
    await undoDuplicateMerge(result.receipt, runtime);
    expect(rows.get("keep")).toEqual(original);
    expect(memberships.get("keep")).toEqual(["folder-a"]);
    expect(rows.get("extra")?.deletedAt).toBeNull();
  });

  it("undo refuses to overwrite survivor edits made after merging", async () => {
    const { rows, runtime } = await fixture();
    const result = await mergeDuplicateSaves(
      { keepId: "keep", ids: ["extra"] },
      runtime,
    );
    if (!result.receipt) throw new Error("Missing merge receipt.");
    const keep = rows.get("keep");
    if (!keep) throw new Error("Missing survivor.");
    keep.tags = ["new work"];
    await expect(undoDuplicateMerge(result.receipt, runtime)).rejects.toThrow(
      "edited",
    );
    expect(keep.tags).toEqual(["new work"]);
  });
  it("preserves unique files, metadata and memberships before trashing extras", async () => {
    const { root, rows, memberships, commits, runtime } = await fixture();
    expect(
      await mergeDuplicateSaves(
        { keepId: "keep", ids: ["keep", "extra", "extra"] },
        runtime,
      ),
    ).toMatchObject({ ok: true, trashed: 1 });
    const keep = rows.get("keep");
    expect(keep?.tags).toEqual(["Design", "Type"]);
    expect(keep?.notes).toBe("Review\n\nFrom the duplicate");
    expect(keep?.files).toHaveLength(2);
    expect(await readFile(join(root, "keep", "clip.mp4"), "utf8")).toBe(
      "extra video",
    );
    expect(await readFile(join(root, "extra", "clip.mp4"), "utf8")).toBe(
      "extra video",
    );
    expect(memberships.get("keep")).toEqual(["folder-a", "folder-b"]);
    expect(rows.get("extra")?.deletedAt).toBeInstanceOf(Date);
    expect(commits[0]?.[0]).toMatchObject({
      kind: "update",
      before: { tags: ["Design"] },
    });
    expect(commits[1]?.[0]?.kind).toBe("trash");
  });

  it("keeps every duplicate live if a unique original cannot be read", async () => {
    const { root, rows, commits, runtime } = await fixture();
    await rm(join(root, "extra", "clip.mp4"));
    await expect(
      mergeDuplicateSaves({ keepId: "keep", ids: ["extra"] }, runtime),
    ).rejects.toThrow();
    expect(rows.get("extra")?.deletedAt).toBeNull();
    expect(commits).toEqual([]);
  });

  it("rejects nonexistent or trashed survivors without changing other Saves", async () => {
    const { rows, commits, runtime } = await fixture();
    await expect(
      mergeDuplicateSaves({ keepId: "missing", ids: ["extra"] }, runtime),
    ).rejects.toThrow("existing survivor");
    const keep = rows.get("keep");
    if (!keep) throw new Error("Missing test Save.");
    keep.deletedAt = new Date();
    await expect(
      mergeDuplicateSaves({ keepId: "keep", ids: ["extra"] }, runtime),
    ).rejects.toThrow("existing survivor");
    expect(commits).toEqual([]);
  });

  it("does not trash extras when folder preservation fails", async () => {
    const { rows, runtime } = await fixture();
    runtime.setFolders = async () => ({
      ok: false,
      error: "Folder not found.",
    });
    await expect(
      mergeDuplicateSaves({ keepId: "keep", ids: ["extra"] }, runtime),
    ).rejects.toThrow("folders");
    expect(rows.get("extra")?.deletedAt).toBeNull();
  });

  it("serializes overlapping merges so an already trashed extra cannot be merged again", async () => {
    const { rows, runtime } = await fixture();
    const results = await Promise.allSettled([
      mergeDuplicateSaves({ keepId: "keep", ids: ["extra"] }, runtime),
      mergeDuplicateSaves({ keepId: "keep", ids: ["extra"] }, runtime),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(rows.get("keep")?.files).toHaveLength(2);
  });
});
