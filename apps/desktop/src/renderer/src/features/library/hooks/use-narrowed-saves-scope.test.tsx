import { PrefsSchema } from "@pond/schema";
import { LibraryQueryRequestSchema } from "@shared/library-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveListMode } from "@/features/saves";
import { libraryChrome } from "../state/library-chrome";
import {
  resetFilters,
  searchAllSaves,
  searchCurrentView,
  setSearchDraft,
} from "../state/view-store";
import { useNarrowedSaves } from "./use-narrowed-saves";

const prefs = PrefsSchema.parse({});

function Probe({ mode }: { mode: SaveListMode }) {
  const paging = useNarrowedSaves(mode, "");
  return <output data-request={paging.queryKey} />;
}

describe("library search scope", () => {
  let host: HTMLDivElement;
  let root: Root;

  function scope() {
    const raw = host.querySelector("output")?.getAttribute("data-request");
    return LibraryQueryRequestSchema.parse(JSON.parse(raw ?? "{}")).scope;
  }

  async function render(mode: SaveListMode) {
    await act(async () => root.render(<Probe mode={mode} />));
  }

  beforeEach(() => {
    vi.stubGlobal("pond", {
      query: vi.fn(async (name: string) => {
        if (name === "settings.getPrefs") return prefs;
        if (name === "settings.setPrefs") return { prefs };
        if (name === "saves.queryPage")
          return {
            ids: [],
            total: 0,
            revision: 1,
            libraryId: "library",
            nextCursor: null,
          };
        if (name === "saves.queryIds") return { ids: [] };
        return [];
      }),
      onSyncAction: () => () => {},
      onPrefsChanged: () => () => {},
    });
    resetFilters();
    libraryChrome.setNav({ kind: "folder", id: "design" });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    resetFilters();
    libraryChrome.setNav({ kind: "all" });
    vi.unstubAllGlobals();
  });

  it("keeps a folder search inside the folder by default", async () => {
    await render("library");
    await act(async () => setSearchDraft("poster"));
    expect(scope()?.folderIds).toContain("design");
  });

  it("switches to All Saves and back without leaving the folder", async () => {
    await render("library");
    await act(async () => setSearchDraft("poster"));

    await act(async () => searchAllSaves({ kind: "folder", id: "design" }));
    expect(scope()?.folderIds).toBeUndefined();
    expect(libraryChrome.getState().nav).toEqual({
      kind: "folder",
      id: "design",
    });

    await act(async () => searchCurrentView());
    expect(scope()?.folderIds).toContain("design");
  });

  it("returns to the current view after moving to another folder", async () => {
    await render("library");
    await act(async () => setSearchDraft("poster"));
    await act(async () => searchAllSaves({ kind: "folder", id: "design" }));

    await act(async () =>
      libraryChrome.setNav({ kind: "folder", id: "archive" }),
    );
    expect(scope()?.folderIds).toContain("archive");
  });

  it("keeps a Trash search on deleted Saves", async () => {
    libraryChrome.setNav({ kind: "trash" });
    await render("trash");
    await act(async () => setSearchDraft("poster"));
    await act(async () => searchAllSaves({ kind: "trash" }));
    expect(scope()?.deletedOnly).toBe(true);
  });
});
