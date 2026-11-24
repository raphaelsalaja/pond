import { PrefsSchema } from "@pond/schema";
import type { WireSyncAction } from "@shared/wire";
import { RouterContextProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import type { LibraryTestRouter } from "@/app/test/library-router";
import { normalise } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import {
  closeSaveTagPicker,
  openSaveTagPicker,
  syncDepartingSaveIds,
  useIsDepartingSave,
} from "@/features/saves/state/tag-picker";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import { bridge } from "@/shared/test/pond-bridge";
import { useNarrowedSaves } from "./use-narrowed-saves";

const prefs = PrefsSchema.parse({});
const tagged: WireSyncAction = {
  id: 1,
  batchId: null,
  modelName: "save",
  modelId: "leaving",
  action: "U",
  data: null,
  prevData: null,
  actor: "user",
  actorReason: null,
  createdAt: 0,
};

function save(id: string) {
  const row = normalise({
    id,
    source: "web",
    sourceId: id,
    url: `https://fixture.test/${id}`,
    title: id,
    files: [],
    tags: [],
  });
  if (!row) {
    throw new Error("Invalid fixture");
  }
  return row;
}

function Probe() {
  const paging = useNarrowedSaves("untagged", "");
  const departing = useIsDepartingSave("leaving");
  return (
    <div
      data-ids={paging.filtered.map((row) => row.id).join(" ")}
      data-loading={paging.loading ? "true" : "false"}
      data-departing={departing ? "true" : "false"}
    />
  );
}

describe("tagging in a filtered view", () => {
  let host: HTMLDivElement;
  let root: Root;
  let router: LibraryTestRouter;
  let ids = ["keep", "leaving"];

  async function renderProbe() {
    await act(async () => {
      root.render(
        <RouterContextProvider router={router}>
          <Probe />
        </RouterContextProvider>,
      );
    });
  }

  beforeEach(async () => {
    ids = ["keep", "leaving"];
    router = await openLibraryAt(pathForLibraryNav({ kind: "untagged" }));
    pool.upsert(save("keep"));
    pool.upsert(save("leaving"));
    closeSaveTagPicker();
    bridge.use({
      query: {
        "settings.getPrefs": () => prefs,
        "settings.setPrefs": () => ({ ok: true, prefs }),
        "saves.queryPage": () => ({
          ids: [...ids],
          total: ids.length,
          revision: 1,
          libraryId: "library",
          nextCursor: null,
        }),
        "saves.queryIds": () => ({
          ids: [...ids],
          revision: 1,
          libraryId: "library",
        }),
        "saves.getMany": () => [],
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => root.unmount());
    host.remove();
    closeSaveTagPicker();
    syncDepartingSaveIds([]);
    pool.clear();
  });

  it("keeps a save mounted until the tag picker closes when tagging removes it from the view", async () => {
    await renderProbe();
    await settle("keep leaving");
    openSaveTagPicker(["leaving"], "leaving");
    await renderProbe();

    ids = ["keep"];
    vi.useFakeTimers();
    bridge.emit("onSyncAction", tagged);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    vi.useRealTimers();

    expect(host.querySelector("[data-ids]")?.getAttribute("data-ids")).toBe(
      "keep leaving",
    );
    expect(
      host.querySelector("[data-departing]")?.getAttribute("data-departing"),
    ).toBe("true");

    closeSaveTagPicker();
    await renderProbe();
    expect(host.querySelector("[data-ids]")?.getAttribute("data-ids")).toBe(
      "keep",
    );
    expect(
      host.querySelector("[data-departing]")?.getAttribute("data-departing"),
    ).toBe("false");
  });
});

async function settle(expected: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const ids = document.querySelector("[data-ids]")?.getAttribute("data-ids");
    const loading = document
      .querySelector("[data-loading]")
      ?.getAttribute("data-loading");
    if (ids === expected && loading === "false") {
      return;
    }
  }
  throw new Error(
    `Filtered view did not settle: ${document.body.textContent ?? ""}`,
  );
}
