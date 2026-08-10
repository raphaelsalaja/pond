import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/save/snapshot", () => ({
  readSnapshot: vi.fn(),
  scheduleSnapshotWrite: vi.fn(),
}));

vi.mock("@/lib/save/sync-coalesce", () => ({
  applyActionCoalesced: vi.fn(),
}));

describe("bootPool", () => {
  const query = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    query.mockReset();
    vi.stubGlobal("window", {
      pond: {
        query,
        onSyncAction: vi.fn(),
      },
    });

    const snapshot = await import("@/lib/save/snapshot");
    vi.mocked(snapshot.readSnapshot).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops after the first page until another page is requested", async () => {
    query.mockResolvedValue({
      rows: [{ id: "new", savedAt: 20 }],
      nextCursor: { savedAt: 20, id: "new" },
      total: 2,
    });
    const { bootPool, pagingStore } = await import("./bootstrap");

    await bootPool();

    expect(query).toHaveBeenCalledWith("saves.listPage", { limit: 250 });
    expect(pagingStore.state).toMatchObject({
      ready: true,
      loaded: 1,
      total: 2,
      hasMore: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a full hydrate and disables cursor paging once complete", async () => {
    query.mockImplementation((method: string) => {
      if (method === "saves.listPage") {
        return Promise.resolve({
          rows: [{ id: "new", savedAt: 20 }],
          nextCursor: { savedAt: 20, id: "new" },
          total: 2,
        });
      }
      if (method === "saves.list") {
        return Promise.resolve([
          { id: "new", savedAt: 20 },
          { id: "cold-save", savedAt: 10 },
        ]);
      }
      throw new Error(`Unexpected query: ${method}`);
    });
    const { bootPool, hydrateFullPool, loadNextPage, pagingStore } =
      await import("./bootstrap");

    await bootPool();
    const first = hydrateFullPool();
    const second = hydrateFullPool();
    expect(second).toBe(first);
    await first;
    await loadNextPage();

    expect(query).toHaveBeenCalledWith("saves.list", {});
    expect(query).not.toHaveBeenCalledWith("saves.listPage", {
      limit: 250,
      cursor: { savedAt: 20, id: "new" },
    });
    expect(pagingStore.state).toMatchObject({
      loaded: 2,
      total: 2,
      nextCursor: null,
      hasMore: false,
    });
  });

  it("hydrates a searched cold save with getMany without loading a library page", async () => {
    query.mockImplementation((method: string) => {
      if (method === "saves.listPage") {
        return Promise.resolve({
          rows: [{ id: "new", savedAt: 20 }],
          nextCursor: { savedAt: 20, id: "new" },
          total: 2,
        });
      }
      if (method === "saves.getMany") {
        return Promise.resolve([{ id: "cold-save", savedAt: 10 }]);
      }
      throw new Error(`Unexpected query: ${method}`);
    });
    const { bootPool } = await import("./bootstrap");
    const { ensureSaves } = await import("@/lib/save/ensure-saves");

    await bootPool();
    await ensureSaves(["cold-save"]);

    expect(query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["cold-save"],
    });
    expect(query).not.toHaveBeenCalledWith(
      "saves.listPage",
      expect.objectContaining({ cursor: expect.anything() }),
    );
  });
});
