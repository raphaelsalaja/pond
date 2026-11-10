import { PrefsSchema } from "@pond/schema";
import {
  type LibraryQueryRequest,
  LibraryQueryRequestSchema,
} from "@shared/library-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalise } from "@/features/saves";
import { rememberListPath } from "@/features/saves/lib/list-path";
import { followDeparture } from "@/features/saves/lib/save-nav";
import {
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import { clearRecents, useTrackVisit } from "@/features/saves/state/recents";
import { setAppRouter } from "@/shared/lib/app-router";
import { useNarrowedSaves } from "./use-narrowed-saves";

const SAVE_ID = "recent-save";

function page() {
  return {
    ids: [SAVE_ID],
    total: 1,
    revision: 1,
    libraryId: "library",
    nextCursor: null,
  };
}

function Collection({ preview }: { preview: boolean }) {
  const paging = useNarrowedSaves("recentlyAdded", "");
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    resultNavigation.setSource({
      key: paging.queryKey,
      total: paging.total,
      loadedIds: paging.loadedIds,
      ids: paging.filtered.map((save) => save.id),
      allIds: paging.allIds,
      loadMore: paging.loadMore,
    });
  }, [paging]);
  useEffect(() => {
    if (!preview || opened) return;
    if (paging.loading || !paging.filtered.some((save) => save.id === SAVE_ID))
      return;
    setOpened(true);
  }, [opened, paging, preview]);
  return (
    <div
      data-loading={paging.loading ? "true" : "false"}
      data-ids={paging.filtered.map((save) => save.id).join(" ")}
    >
      {opened ? <OpenedSave id={SAVE_ID} /> : null}
    </div>
  );
}

function OpenedSave({ id }: { id: string }) {
  useTrackVisit(id);
  useEffect(() => followDeparture(id), [id]);
  return null;
}

describe("recently added preview", () => {
  let host: HTMLDivElement;
  let root: Root;
  const cutoffs: Array<number | undefined> = [];
  const prefs = PrefsSchema.parse({});

  beforeEach(() => {
    cutoffs.length = 0;
    const save = normalise({
      id: SAVE_ID,
      source: "web",
      sourceId: SAVE_ID,
      url: "https://fixture.test/recent",
      title: "Recent reference",
      files: [],
    });
    if (!save) throw new Error("Invalid fixture");
    pool.upsert(save);
    rememberListPath("/recently-added");
    selection.setCursor(SAVE_ID);
    primarySelection.set(SAVE_ID);
    vi.stubGlobal("pond", {
      query: vi.fn(async (name: string, input?: LibraryQueryRequest) => {
        if (name === "settings.getPrefs") return prefs;
        if (name === "settings.setPrefs") return { prefs };
        if (name === "saves.queryPage") {
          const request = LibraryQueryRequestSchema.parse(input);
          cutoffs.push(request.scope?.savedSince);
          return page();
        }
        if (name === "saves.queryIds") return { ids: [SAVE_ID] };
        if (name === "saves.getMany") return [];
        return [];
      }),
      onSyncAction: () => () => {},
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    clearRecents();
    pool.clear();
    selection.clear();
    primarySelection.set(null);
    resultNavigation.setSource({ ids: [] });
    vi.unstubAllGlobals();
  });

  it("keeps the open save when a visit is recorded from Recently Added", async () => {
    await act(async () => {
      root.render(<Collection preview={false} />);
    });
    await settle(host);
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({
        initialEntries: [`/save/${SAVE_ID}`],
      }),
    });
    setAppRouter(router);
    const cutoff = cutoffs.at(-1);
    expect(cutoff).toEqual(expect.any(Number));
    const queriesBeforeOpen = cutoffs.length;

    await act(async () => {
      root.render(<Collection preview />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(host.querySelector("[data-ids]")?.getAttribute("data-ids")).toBe(
      SAVE_ID,
    );
    expect(
      host.querySelector("[data-loading]")?.getAttribute("data-loading"),
    ).toBe("false");
    expect(router.history.location.pathname).toBe(`/save/${SAVE_ID}`);
    expect(cutoffs.slice(queriesBeforeOpen)).toEqual([]);
    expect(new Set(cutoffs)).toEqual(new Set([cutoff]));
  });
});

async function settle(host: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const ids = host.querySelector("[data-ids]")?.getAttribute("data-ids");
    const loading = host
      .querySelector("[data-loading]")
      ?.getAttribute("data-loading");
    if (ids === SAVE_ID && loading === "false") return;
  }
  throw new Error(`Recently Added did not settle: ${host.innerHTML}`);
}
