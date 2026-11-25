import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { createPoolBootstrap } from "./bootstrap";
import { pool } from "./pool";

const fresh = wireSave({ id: "new", savedAt: 20 });
const cold = wireSave({ id: "cold-save", savedAt: 10 });
const firstPage = {
  rows: [fresh],
  nextCursor: { savedAt: 20, id: "new" },
  total: 2,
};

describe("bootPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pool.clear();
    bridge.use({
      rendererReady: () => {},
      query: { "saves.listPage": () => firstPage },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    pool.clear();
  });

  it("stops after the first page until another page is requested", async () => {
    const { bootPool, pagingStore } = createPoolBootstrap();

    await bootPool();

    expect(window.pond.query).toHaveBeenCalledWith("saves.listPage", {
      limit: 250,
    });
    expect(pagingStore.state).toMatchObject({
      ready: true,
      loaded: 1,
      total: 2,
      hasMore: true,
    });
    expect(window.pond.query).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a full hydrate and disables cursor paging once complete", async () => {
    bridge.use({ query: { "saves.list": () => [fresh, cold] } });
    const { bootPool, hydrateFullPool, loadNextPage, pagingStore } =
      createPoolBootstrap();

    await bootPool();
    const first = hydrateFullPool();
    const second = hydrateFullPool();
    expect(second).toBe(first);
    await first;
    await loadNextPage();

    expect(window.pond.query).toHaveBeenCalledWith("saves.list", {});
    expect(window.pond.query).not.toHaveBeenCalledWith("saves.listPage", {
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
    bridge.use({ query: { "saves.getMany": () => [cold] } });
    const { bootPool } = createPoolBootstrap();

    await bootPool();
    await ensureSaves(["cold-save"]);

    expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["cold-save"],
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "saves.listPage",
      expect.objectContaining({ cursor: expect.anything() }),
    );
  });
});
