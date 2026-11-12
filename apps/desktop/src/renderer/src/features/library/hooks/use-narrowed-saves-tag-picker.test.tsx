import { PrefsSchema } from "@pond/schema";
import type { LibraryQueryRequest } from "@shared/library-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalise } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import {
  closeSaveTagPicker,
  openSaveTagPicker,
  syncDepartingSaveIds,
  useIsDepartingSave,
} from "@/features/saves/state/tag-picker";
import { useNarrowedSaves } from "./use-narrowed-saves";

const prefs = PrefsSchema.parse({});

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
  if (!row) throw new Error("Invalid fixture");
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
  let ids = ["keep", "leaving"];
  let sync: (() => void) | null = null;

  beforeEach(() => {
    ids = ["keep", "leaving"];
    sync = null;
    pool.upsert(save("keep"));
    pool.upsert(save("leaving"));
    closeSaveTagPicker();
    vi.stubGlobal("pond", {
      query: vi.fn(async (name: string, _input?: LibraryQueryRequest) => {
        if (name === "settings.getPrefs") return prefs;
        if (name === "settings.setPrefs") return { prefs };
        if (name === "saves.queryPage") {
          return {
            ids: [...ids],
            total: ids.length,
            revision: 1,
            libraryId: "library",
            nextCursor: null,
          };
        }
        if (name === "saves.queryIds") return { ids: [...ids] };
        if (name === "saves.getMany") return [];
        return [];
      }),
      onSyncAction: (listener: () => void) => {
        sync = listener;
        return () => {
          if (sync === listener) sync = null;
        };
      },
      onPrefsChanged: () => () => {},
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    closeSaveTagPicker();
    syncDepartingSaveIds([]);
    pool.clear();
    vi.unstubAllGlobals();
  });

  it("keeps a save mounted until the tag picker closes when tagging removes it from the view", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await settle("keep leaving");
    openSaveTagPicker(["leaving"], "leaving");
    await act(async () => {
      root.render(<Probe />);
    });

    ids = ["keep"];
    sync?.();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(host.querySelector("[data-ids]")?.getAttribute("data-ids")).toBe(
      "keep leaving",
    );
    expect(
      host.querySelector("[data-departing]")?.getAttribute("data-departing"),
    ).toBe("true");

    closeSaveTagPicker();
    await act(async () => {
      root.render(<Probe />);
    });
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
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const ids = document.querySelector("[data-ids]")?.getAttribute("data-ids");
    const loading = document
      .querySelector("[data-loading]")
      ?.getAttribute("data-loading");
    if (ids === expected && loading === "false") return;
  }
  throw new Error(
    `Filtered view did not settle: ${document.body.textContent ?? ""}`,
  );
}
