import { PrefsSchema } from "@pond/schema";
import { LibraryQueryRequestSchema } from "@shared/library-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, createContext, use } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import type { LibraryTestRouter } from "@/app/test/library-router";
import type { SaveListMode } from "@/features/saves";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { bridge } from "@/shared/test/pond-bridge";
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

const ProbeMode = createContext<SaveListMode>("library");

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Probe mode={use(ProbeMode)} />
    </>
  );
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
    await act(async () =>
      root.render(
        <ProbeMode value={mode}>
          <RouterProvider router={router} InnerWrap={Shell} />
        </ProbeMode>,
      ),
    );
  }

  beforeEach(() => {
    bridge.use({
      query: {
        "settings.getPrefs": () => prefs,
        "settings.setPrefs": () => ({ ok: true, prefs }),
        "saves.queryPage": () => ({
          ids: [],
          total: 0,
          revision: 1,
          libraryId: "library",
          nextCursor: null,
        }),
        "saves.queryIds": () => ({
          ids: [],
          revision: 1,
          libraryId: "library",
        }),
        "saves.getMany": () => [],
      },
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
