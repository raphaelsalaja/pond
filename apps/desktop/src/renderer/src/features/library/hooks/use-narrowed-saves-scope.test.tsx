import { PrefsSchema } from "@pond/schema";
import { LibraryQueryRequestSchema } from "@shared/library-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveListMode } from "@/features/saves";
import { type LibraryNav, pathForLibraryNav } from "@/shared/lib/library-nav";
import {
  type LibraryTestRouter,
  openLibraryAt,
} from "@/shared/test/library-router";
import { getLibraryNav } from "../state/library-chrome";
import {
  resetFilters,
  searchAllSaves,
  searchCurrentView,
  setSearchDraft,
} from "../state/view-store";
import { useNarrowedSaves } from "./use-narrowed-saves";

const prefs = PrefsSchema.parse({});
const design: LibraryNav = { kind: "folder", id: "design" };

function Probe({ mode }: { mode: SaveListMode }) {
  const paging = useNarrowedSaves(mode, "");
  return <output data-request={paging.queryKey} />;
}

describe("library search scope", () => {
  let host: HTMLDivElement;
  let root: Root;
  let router: LibraryTestRouter;

  function scope() {
    const raw = host.querySelector("output")?.getAttribute("data-request");
    return LibraryQueryRequestSchema.parse(JSON.parse(raw ?? "{}")).scope;
  }

  async function render(mode: SaveListMode, nav: LibraryNav = design) {
    router = await openLibraryAt(pathForLibraryNav(nav));
    const Shell = ({ children }: { children: ReactNode }) => (
      <>
        {children}
        <Probe mode={mode} />
      </>
    );
    await act(async () =>
      root.render(<RouterProvider router={router} InnerWrap={Shell} />),
    );
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
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    resetFilters();
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

    await act(async () => searchAllSaves(design));
    expect(scope()?.folderIds).toBeUndefined();
    expect(getLibraryNav()).toEqual(design);

    await act(async () => searchCurrentView());
    expect(scope()?.folderIds).toContain("design");
  });

  it("returns to the current view after moving to another folder", async () => {
    await render("library");
    await act(async () => setSearchDraft("poster"));
    await act(async () => searchAllSaves(design));

    await act(async () =>
      router.history.push(pathForLibraryNav({ kind: "folder", id: "archive" })),
    );
    expect(scope()?.folderIds).toContain("archive");
  });

  it("keeps a Trash search on deleted Saves", async () => {
    await render("trash", { kind: "trash" });
    await act(async () => setSearchDraft("poster"));
    await act(async () => searchAllSaves({ kind: "trash" }));
    expect(scope()?.deletedOnly).toBe(true);
  });
});
