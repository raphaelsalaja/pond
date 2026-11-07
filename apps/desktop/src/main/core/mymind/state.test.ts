import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMymindSyncState,
  readMymindSyncState,
  removeMymindSyncState,
  writeMymindSyncState,
} from "./state";

const roots: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-mymind-state-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("mymind import state", () => {
  it("keeps the connection date when the checked range advances", async () => {
    const root = await fixture();
    const state = createMymindSyncState(Date.parse("2026-11-06T12:00:00Z"));
    state.checkedThrough = "2026-11-07T12:00:00Z";
    state.imports.card = { saveId: "save", complete: false };
    state.retryAt = Date.parse("2026-11-07T14:00:00Z");
    await writeMymindSyncState(root, "account", state);
    expect(await readMymindSyncState(root, "account")).toEqual(state);
    const stored = JSON.parse(
      await readFile(join(root, "mymind", "account.json"), "utf8"),
    );
    expect(stored.schemaVersion).toBe(1);
  });

  it("does not reset missing or corrupt state", async () => {
    const root = await fixture();
    await expect(readMymindSyncState(root, "account")).rejects.toThrow(
      "missing or invalid",
    );
    await writeMymindSyncState(root, "account", createMymindSyncState(0));
    const file = join(root, "mymind", "account.json");
    await writeFile(file, "invalid");
    await expect(readMymindSyncState(root, "account")).rejects.toThrow(
      "missing or invalid",
    );
    expect(await readFile(file, "utf8")).toBe("invalid");
  });

  it("rejects invalid state instead of replacing the saved cutoff", async () => {
    const root = await fixture();
    const state = createMymindSyncState(Date.parse("2026-11-06T12:00:00Z"));
    await writeMymindSyncState(root, "account", state);
    await expect(
      writeMymindSyncState(root, "account", {
        ...state,
        checkedThrough: "2026-11-05T12:00:00Z",
      }),
    ).rejects.toThrow("invalid");
    expect(await readMymindSyncState(root, "account")).toEqual(state);
  });

  it("rejects a valid JSON file with invalid state data", async () => {
    const root = await fixture();
    await writeMymindSyncState(root, "account", createMymindSyncState(0));
    await writeFile(
      join(root, "mymind", "account.json"),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: 1,
        data: { startedAt: "invalid", checkedThrough: "invalid", imports: {} },
      }),
    );
    await expect(readMymindSyncState(root, "account")).rejects.toThrow(
      "missing or invalid",
    );
  });

  it("removes only the incomplete account's state", async () => {
    const root = await fixture();
    await writeMymindSyncState(root, "incomplete", createMymindSyncState(0));
    await writeMymindSyncState(root, "connected", createMymindSyncState(1000));
    await removeMymindSyncState(root, "incomplete");
    await expect(readMymindSyncState(root, "incomplete")).rejects.toThrow(
      "missing or invalid",
    );
    expect((await readMymindSyncState(root, "connected")).startedAt).toBe(
      "1970-01-01T00:00:01.000Z",
    );
  });

  it("keeps account files separate and rejects path traversal", async () => {
    const root = await fixture();
    await writeMymindSyncState(root, "first", createMymindSyncState(0));
    await writeMymindSyncState(root, "second", createMymindSyncState(1000));
    expect((await readMymindSyncState(root, "first")).startedAt).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect((await readMymindSyncState(root, "second")).startedAt).toBe(
      "1970-01-01T00:00:01.000Z",
    );
    await expect(readMymindSyncState(root, "../account")).rejects.toThrow(
      "account ID",
    );
  });
});
