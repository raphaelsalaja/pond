import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { folders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { navigationHistory } from "@/features/library/state/navigation-history";
import { restoreLibraryNav } from "./navigation";
import {
  createFolderSidebarHarness,
  fishList,
  folder,
  folderList,
  queueSummary,
  sidebarCounts,
} from "./test-harness";

describe("folder sidebar navigation", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  it("opens a fish from the Fish group", async () => {
    fishList.current = [
      {
        id: "default",
        name: "Koi",
        color: "orange",
        species: "koi",
        instructions: "",
        scope: { folderIds: [], tags: [] },
        model: null,
        routines: [],
        lastRun: null,
        createdAt: 0,
        updatedAt: 0,
        activity: null,
        latest: null,
      },
    ];
    const router = await harness.mount();
    await act(async () => {});
    await act(async () => harness.button("Koi").click());
    expect(router.state.location.pathname).toBe("/fish/default");
    expect(harness.button("Koi").getAttribute("aria-current")).toBe("page");
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
  });

  it("shows the running download count on the Downloads row", async () => {
    queueSummary.current = { ...queueSummary.current, running: 12, waiting: 4 };
    const router = await harness.mount();
    expect(harness.host.querySelector('[aria-label^="Downloads"]')).toBeNull();
    const row = await vi.waitFor(() => {
      const match = harness.host
        .querySelector('[title="12 downloading"]')
        ?.closest("button");
      if (!match)
        throw new Error("Expected the Downloads row to show 12 downloading");
      return match;
    });
    expect(row.textContent).toContain("Downloads");
    await act(async () => row.click());
    expect(router.state.location.pathname).toBe("/downloads");
  });

  it("lists Sources then Downloads under Harvesting", async () => {
    await harness.mount();
    const group = [...document.querySelectorAll("*")].find(
      (node) => node.children.length === 0 && node.textContent === "Harvesting",
    );
    expect(group).toBeTruthy();
    const sources = harness.button("Sources");
    const downloads = harness.button("Downloads");
    expect(
      sources.compareDocumentPosition(downloads) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens Sources and Downloads in the main window", async () => {
    const router = await harness.mount();
    await act(async () => harness.button("Sources").click());
    expect(router.state.location.pathname).toBe("/sources");
    expect(harness.button("Sources").getAttribute("aria-current")).toBe("page");
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();

    await act(async () => harness.button("Downloads").click());
    expect(router.state.location.pathname).toBe("/downloads");
    expect(harness.button("Downloads").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(harness.button("Sources").getAttribute("aria-current")).toBeNull();
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
  });

  it("opens Uncategorized from the sidebar", async () => {
    const router = await harness.mount();
    await act(async () => harness.button("Uncategorized").click());
    expect(router.state.location.pathname).toBe("/");
    expect(libraryChrome.getState().nav).toEqual({ kind: "uncategorized" });
    expect(harness.button("Uncategorized").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
  });

  it("opens Untagged from the sidebar", async () => {
    const router = await harness.mount();
    await act(async () => harness.button("Untagged").click());
    expect(router.state.location.pathname).toBe("/untagged");
    expect(harness.button("Untagged").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
  });

  it("shows counts on library destinations", async () => {
    sidebarCounts.current.recentlyUsed = 4;
    await harness.mount();
    expect(harness.button("Recently Used").textContent).toContain("4");
    for (const label of ["All", "Uncategorized", "Untagged", "Tags", "Trash"]) {
      expect(harness.button(label).textContent).toContain("0");
    }
  });

  it("opens Tags from the sidebar with an outline icon", async () => {
    const router = await harness.mount();
    const tags = harness.button("Tags");
    expect(tags.querySelector('[stroke="currentColor"]')).not.toBeNull();
    expect(tags.querySelector('path[fill="currentColor"]')).toBeNull();
    await act(async () => tags.click());
    expect(router.state.location.pathname).toBe("/tags");
    expect(tags.getAttribute("aria-current")).toBe("page");
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
  });

  it.each([
    ["/tags", "Tags"],
    ["/untagged", "Untagged"],
  ])("highlights only %s when opened directly", async (path, label) => {
    await harness.mount(path);
    expect(harness.host.querySelectorAll('[aria-current="page"]')).toHaveLength(
      1,
    );
    expect(
      harness.rowLabel(
        harness.host.querySelector('[aria-current="page"]') ?? harness.host,
      ),
    ).toBe(label);
  });

  it.each([
    ["/tags", "Tags"],
    ["/untagged", "Untagged"],
  ])("updates the %s highlight across route history", async (path, label) => {
    const router = await harness.mount(path);
    await act(async () => harness.button("All").click());
    expect(router.state.location.pathname).toBe("/");
    expect(harness.button("All").getAttribute("aria-current")).toBe("page");
    await act(async () => router.history.back());
    expect(router.state.location.pathname).toBe(path);
    expect(harness.button(label).getAttribute("aria-current")).toBe("page");
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
    await act(async () => harness.button("Uncategorized").click());
    expect(harness.button(label).getAttribute("aria-current")).toBeNull();
    expect(harness.button("Uncategorized").getAttribute("aria-current")).toBe(
      "page",
    );
  });

  function highlighted(): string[] {
    const labels = [
      ...harness.host.querySelectorAll(
        'button[data-status="active"], button[aria-current="page"], button[aria-selected="true"]',
      ),
    ].map((node) => node.getAttribute("aria-label") ?? harness.rowLabel(node));
    return [...new Set(labels.filter((label) => label.length > 0))];
  }

  it("follows the open destination across folders and built-in collections", async () => {
    folderList.current = [folder("Repos"), folder("Design")];
    await folders.refresh();
    navigationHistory.clear();
    libraryChrome.setNav({ kind: "all" });
    const router = await harness.mount();

    expect(highlighted()).toEqual(["All"]);

    await act(async () => harness.button("Repos").click());
    expect(router.state.location.pathname).toBe("/");
    expect(highlighted()).toEqual(["Repos"]);

    await act(async () => harness.button("Design").click());
    expect(router.state.location.pathname).toBe("/");
    expect(highlighted()).toEqual(["Design"]);

    await act(async () => harness.button("Downloads").click());
    expect(router.state.location.pathname).toBe("/downloads");
    expect(highlighted()).toEqual(["Downloads"]);

    await act(async () => harness.button("Repos").click());
    expect(router.state.location.pathname).toBe("/");
    expect(highlighted()).toEqual(["Repos"]);

    await act(async () => harness.button("Sources").click());
    expect(router.state.location.pathname).toBe("/sources");
    expect(highlighted()).toEqual(["Sources"]);

    await act(async () => harness.button("Design").click());
    expect(highlighted()).toEqual(["Design"]);

    await act(async () => harness.button("Recently Added").click());
    expect(router.state.location.pathname).toBe("/recently-added");
    expect(highlighted()).toEqual(["Recently Added"]);

    await act(async () => harness.button("Trash").click());
    expect(router.state.location.pathname).toBe("/trash");
    expect(highlighted()).toEqual(["Trash"]);

    await act(async () => harness.button("Uncategorized").click());
    expect(router.state.location.pathname).toBe("/");
    expect(highlighted()).toEqual(["Uncategorized"]);

    await act(async () => harness.button("Tags").click());
    expect(router.state.location.pathname).toBe("/tags");
    expect(highlighted()).toEqual(["Tags"]);

    await act(async () => harness.button("Untagged").click());
    expect(router.state.location.pathname).toBe("/untagged");
    expect(highlighted()).toEqual(["Untagged"]);

    await act(async () => harness.button("All").click());
    expect(router.state.location.pathname).toBe("/");
    expect(highlighted()).toEqual(["All"]);

    await act(async () => harness.button("Repos").click());
    await act(async () => harness.button("Downloads").click());
    expect(highlighted()).toEqual(["Downloads"]);
    await act(async () => {
      const previous = navigationHistory.back();
      if (!previous) throw new Error("Expected to return to Repos");
      restoreLibraryNav(previous);
    });
    expect(router.state.location.pathname).toBe("/");
    expect(libraryChrome.getState().nav).toEqual({
      kind: "folder",
      id: "Repos",
    });
    expect(highlighted()).toEqual(["Repos"]);
  });

  it("groups library destinations", async () => {
    await harness.mount();
    const labels = [...harness.host.querySelectorAll("button")].map(
      harness.rowLabel,
    );
    const library = labels.indexOf("All");
    const uncategorized = labels.indexOf("Uncategorized");
    const untagged = labels.indexOf("Untagged");
    const tags = labels.indexOf("Tags");
    const trash = labels.indexOf("Trash");
    expect(library).toBeLessThan(uncategorized);
    expect(uncategorized).toBeLessThan(untagged);
    expect(untagged).toBeLessThan(tags);
    expect(tags).toBeLessThan(trash);
    expect(trash).toBeLessThan(labels.indexOf("Sources"));
    expect(labels.indexOf("Sources")).toBeLessThan(labels.indexOf("Downloads"));
  });

  it("does not collapse library and downloads groups", async () => {
    await harness.mount();
    const toggles = [
      ...harness.host.querySelectorAll("button[aria-expanded]"),
    ].map((node) => node.textContent?.trim());
    expect(toggles).toContain("Smart Folders");
    expect(toggles).toContain("Folders");
    expect(toggles).not.toContain("Library");
    expect(toggles).not.toContain("Downloads");
  });
});
