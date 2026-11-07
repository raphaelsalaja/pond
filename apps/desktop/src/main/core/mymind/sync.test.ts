import { describe, expect, it, vi } from "vitest";
import type { MymindObject } from "./client";
import { createMymindSyncState } from "./state";
import { importNewMymindObjects } from "./sync";

const connectedAt = Date.parse("2026-11-06T12:00:00Z");
const end = connectedAt + 60_000;

function object(id: string, offset: number): MymindObject {
  return {
    id,
    created: new Date(connectedAt + offset).toISOString(),
    tags: [],
  };
}

function fixture(objects: MymindObject[]) {
  const state = createMymindSyncState(connectedAt);
  const requests: { start: number; end: number }[] = [];
  const persist = vi.fn(async () => {});
  const importObject = vi.fn(async (item: MymindObject) => {
    const id = `save-${item.id}`;
    state.imports[item.id] = { saveId: id, complete: true };
    await persist();
    return { id, imported: true };
  });
  const dependencies = {
    client: {
      async *listCreatedObjects(request: { start: number; end: number }) {
        requests.push({ start: request.start, end: request.end });
        yield* objects;
      },
    },
    importObject,
    persist,
    now: end,
  };
  return { state, requests, dependencies, importObject, persist };
}

describe("new mymind imports", () => {
  it("excludes older items even if the API returns them", async () => {
    const f = fixture([
      object("old", -1),
      object("new", 1),
      object("future", 120_000),
    ]);
    const result = await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      undefined,
      f.dependencies,
    );
    expect(result.imported).toEqual(["save-new"]);
    expect(f.requests).toEqual([{ start: connectedAt, end }]);
    expect(f.state.startedAt).toBe(new Date(connectedAt).toISOString());
    expect(f.state.checkedThrough).toBe(new Date(end).toISOString());
  });

  it("resumes an unordered stream without skipping items at the batch limit", async () => {
    const f = fixture([
      object("later", 30_000),
      object("earlier", 100),
      object("same-time", 100),
    ]);
    const first = await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      1,
      f.dependencies,
    );
    expect(first.hasMore).toBe(true);
    expect(f.state.checkedThrough).toBe(f.state.startedAt);
    const second = await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      1,
      f.dependencies,
    );
    expect(second.imported).toEqual(["save-earlier"]);
    expect(second.hasMore).toBe(true);
    const third = await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      1,
      f.dependencies,
    );
    expect(third.imported).toEqual(["save-same-time"]);
    expect(third.hasMore).toBe(false);
    expect(f.importObject).toHaveBeenCalledTimes(3);
  });

  it("keeps the lower bound after an import failure and retries incomplete work", async () => {
    const f = fixture([object("new", 100)]);
    f.importObject.mockRejectedValueOnce(new Error("Disk is full."));
    await expect(
      importNewMymindObjects(
        f.state,
        new AbortController().signal,
        undefined,
        f.dependencies,
      ),
    ).rejects.toThrow("Disk is full.");
    expect(f.state.checkedThrough).toBe(f.state.startedAt);
    expect(f.persist).not.toHaveBeenCalled();
    await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      undefined,
      f.dependencies,
    );
    expect(f.state.imports.new?.complete).toBe(true);
  });

  it("does not advance progress when a stream fails after one successful import", async () => {
    const f = fixture([]);
    f.dependencies.client.listCreatedObjects = async function* (request) {
      f.requests.push({ start: request.start, end: request.end });
      yield object("first", 100);
      throw new Error("Connection lost.");
    };
    await expect(
      importNewMymindObjects(
        f.state,
        new AbortController().signal,
        undefined,
        f.dependencies,
      ),
    ).rejects.toThrow("Connection lost.");
    expect(f.state.imports.first?.complete).toBe(true);
    expect(f.state.checkedThrough).toBe(f.state.startedAt);
  });

  it("uses an overlap without crossing the connection time", async () => {
    const f = fixture([]);
    f.state.checkedThrough = new Date(connectedAt + 600_000).toISOString();
    f.dependencies.now = connectedAt + 900_000;
    await importNewMymindObjects(
      f.state,
      new AbortController().signal,
      undefined,
      f.dependencies,
    );
    expect(f.requests[0]?.start).toBe(connectedAt + 300_000);
  });

  it("does not import or save progress after cancellation", async () => {
    const f = fixture([object("new", 1)]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      importNewMymindObjects(
        f.state,
        controller.signal,
        undefined,
        f.dependencies,
      ),
    ).rejects.toThrow();
    expect(f.importObject).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
  });
});
