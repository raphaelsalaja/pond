import { PrefsSchema } from "@pond/schema";
import type { SavedView } from "@pond/schema/db";
import type { QueryInput } from "@shared/query-contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  savedViews,
  useEditingSavedViewId,
} from "@/features/library/state/saved-views";
import {
  getOverlays,
  getViewState,
  resetFilters,
  setSearchInput,
  setSemanticQuery,
  useFilterQuery,
  useSearchText,
} from "@/features/library/state/view-store";
import { normalise } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import { pagingStore } from "@/features/saves/state/bootstrap";
import { FilterBarView, FilterToggleView } from "./";
import { entryFields, FILTER_MENU, FILTER_SECTIONS } from "./options";
import { filterToolbar } from "./toolbar-state";

function State() {
  return (
    <>
      <output>
        {JSON.stringify({ query: useFilterQuery(), text: useSearchText() })}
      </output>
      <span data-editing>{useEditingSavedViewId()}</span>
    </>
  );
}

describe("filter toolbar", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("pond", { query: async () => PrefsSchema.parse({}) });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    resetFilters();
    filterToolbar.setOpen(true);
    filterToolbar.setLayout("pinned");
    filterToolbar.restoreDefaults();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    resetFilters();
    savedViews.finishEditing();
    vi.unstubAllGlobals();
  });

  const data = {
    tags: [{ name: "Design" }],
    tagGroups: [],
    folders: [{ id: "folder-a", name: "Inspiration" }],
    facets: {
      sources: ["youtube.com", "vimeo.com"],
      tags: [],
      creators: [],
      types: [],
    },
    refs: [],
  };

  async function render() {
    await act(async () =>
      root.render(
        <>
          <FilterToggleView {...data} />
          <FilterBarView {...data} />
          <State />
        </>,
      ),
    );
  }

  function state() {
    return JSON.parse(host.querySelector("output")?.textContent ?? "{}");
  }

  function button(label: string) {
    const match = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) =>
        node.getAttribute("aria-label") === label || node.textContent === label,
    );
    if (!match) throw new Error(`Missing button ${label}`);
    return match;
  }

  it("pins Eagle's default categories including Visual Match and Semantic", async () => {
    await render();
    expect(
      [...host.querySelectorAll("fieldset button")].map(
        (node) => node.getAttribute("aria-label") ?? "",
      ),
    ).toEqual([
      "Color",
      "Visual Match",
      "Semantic",
      "Tags",
      "Folders",
      "Shape",
      "Rating",
      "Type",
      "Format",
      "Dimensions",
      "Duration",
      "Size",
      "Note",
      "URL",
      "Date Saved",
      "Date Modified",
      "Customize Filters",
      "Save View",
      "Clear Filters",
    ]);
    expect(button("Color").querySelector("[data-spectrum]")).not.toBeNull();
    for (const label of ["Customize Filters", "Save View", "Clear Filters"]) {
      expect(button(label).querySelector("svg")).not.toBeNull();
    }
    expect(button("Save View").textContent).toBe("");
    expect(button("Clear Filters").textContent).toBe("");
  });

  it("groups filter customization into named sections", async () => {
    await render();
    await act(async () => button("Customize Filters").click());
    const menu = document.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain("Discovery");
    expect(menu?.textContent).toContain("Organize");
    expect(menu?.textContent).toContain("Media");
    expect(menu?.textContent).toContain("Details");
    expect(menu?.textContent).toContain("Dates");
    expect(menu?.textContent).toContain("Reset Filters");
    for (const label of [
      "Discovery",
      "Organize",
      "Media",
      "Details",
      "Dates",
    ]) {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(
        (node) => node.textContent === label,
      );
      expect(item?.querySelector("svg")).not.toBeNull();
    }
    const discovery = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent === "Discovery",
    );
    expect(discovery?.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("shows categories directly and hides the toolbar without clearing filters", async () => {
    setSearchInput(
      [{ field: "source", operator: "eq", value: "youtube.com" }],
      "cats",
      "source:youtube.com cats",
    );
    await render();
    expect(button("Source: YouTube").lastElementChild?.textContent).toBe(
      "YouTube",
    );
    expect(button("Tags")).toBeTruthy();
    const toggle = button("Filter");
    const before = state();
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(state()).toEqual(before);
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("#library-filter-toolbar")).not.toBeNull();
    expect(button("Source: YouTube")).toBeTruthy();
  });

  it("creates an Untitled saved view and starts inline naming", async () => {
    const views: SavedView[] = [];
    const created: QueryInput<"savedViews.create">[] = [];
    vi.stubGlobal("pond", {
      query: async (name: string, input: QueryInput<"savedViews.create">) => {
        if (name === "savedViews.create") {
          created.push(input);
          views.push({
            id: "view-1",
            name: input.name,
            kind: "saved_view",
            parentId: null,
            query: input.query ?? { combinator: "and", rules: [] },
            question: null,
            sortKey: "savedAt",
            sortDir: "desc",
            layout: "waterfall",
            sortOrder: 0,
            createdAt: new Date(),
          });
          return { ok: true, id: "view-1" };
        }
        if (name === "savedViews.list") return views;
        return PrefsSchema.parse({});
      },
    });
    await render();

    await act(async () => button("Save View").click());

    expect(created).toEqual([
      expect.objectContaining({ kind: "saved_view", name: "Untitled" }),
    ]);
    await vi.waitFor(() =>
      expect(host.querySelector("[data-editing]")?.textContent).toBe("view-1"),
    );
    expect(getViewState().activeViewId).toBe("view-1");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows source names without changing filter values", async () => {
    setSearchInput(
      [{ field: "source", operator: "eq", value: "x.com" }],
      "",
      "source:x.com",
    );
    await render();
    const source = button("Source: Twitter");
    expect(source.lastElementChild?.textContent).toBe("Twitter");
    expect(state().query.rules).toEqual([
      { field: "source", operator: "eq", value: "x.com" },
    ]);
  });

  it("shows the selected color as the chip icon and its name as the label", async () => {
    setSearchInput(
      [
        {
          field: "color",
          operator: "near",
          value: { hex: "#2b76e7", tolerance: 60 },
        },
      ],
      "",
    );
    await render();
    const color = button("Color: Blue");
    expect(color.textContent).toBe("Blue");
    expect(color.querySelector('[data-swatch="#2b76e7"]')).not.toBeNull();
    expect(color.querySelector("[data-spectrum]")).toBeNull();
  });

  it("clears only the chosen field while keeping text and other filters", async () => {
    setSearchInput(
      [
        { field: "type", operator: "eq", value: "video" },
        { field: "source", operator: "eq", value: "youtube.com" },
      ],
      "cats",
      "type:video source:youtube.com cats",
    );
    await render();
    await act(async () => button("Clear Source Filter").click());
    expect(state()).toEqual({
      query: {
        combinator: "and",
        rules: [{ field: "type", operator: "eq", value: "video" }],
      },
      text: "cats",
    });
    expect(button("Type: Video")).toBeTruthy();
    expect(
      [...host.querySelectorAll("button")].some(
        (node) => node.getAttribute("aria-label") === "Source",
      ),
    ).toBe(false);
  });

  it("clears all toolbar filters while keeping search text", async () => {
    setSearchInput(
      [
        { field: "type", operator: "eq", value: "video" },
        { field: "source", operator: "eq", value: "youtube.com" },
      ],
      "cats",
      "type:video source:youtube.com cats",
    );
    setSemanticQuery("black cat");
    await render();
    await act(async () => button("Clear Filters").click());
    expect(state()).toEqual({
      query: { combinator: "and", rules: [] },
      text: "cats",
    });
    expect(getOverlays().semanticQuery).toBeNull();
    expect(button("Clear Filters").disabled).toBe(true);
  });

  it("keeps an active category visible when it is unpinned", async () => {
    setSearchInput(
      [{ field: "creator", operator: "eq", value: "jane" }],
      "",
      "by:jane",
    );
    await render();
    expect(button("Creator: jane")).toBeTruthy();
    await act(async () => filterToolbar.setPinned("creator", false));
    expect(button("Creator: jane")).toBeTruthy();
    await act(async () => button("Clear Creator Filter").click());
    expect(
      [...host.querySelectorAll("button")].some(
        (node) => node.getAttribute("aria-label") === "Creator",
      ),
    ).toBe(false);
  });

  it("shows added categories and names selected folders without exposing IDs", async () => {
    setSearchInput(
      [{ field: "folder", operator: "some", value: ["folder-a"] }],
      "",
      "folder:folder-a",
    );
    await render();
    expect(button("Folders: Inspiration").textContent).toBe("Inspiration");
    await act(async () => filterToolbar.setPinned("transcript", true));
    expect(button("Transcript")).toBeTruthy();
  });

  it("clears a Semantic overlay from its chip", async () => {
    setSemanticQuery("black cat");
    await render();
    expect(button("Filter")).toBeTruthy();
    expect(getOverlays().semanticQuery).toBe("black cat");
    await act(async () => button("Clear Semantic Filter").click());
    expect(getOverlays().semanticQuery).toBeNull();
  });

  describe("applied layout", () => {
    beforeEach(() => {
      filterToolbar.setLayout("applied");
      pagingStore.setState((state) => ({ ...state, hasMore: false }));
      pool.clear();
      const save = normalise({
        id: "clip",
        source: "web",
        url: "https://www.youtube.com/watch?v=1",
      });
      if (!save) throw new Error("Invalid save fixture");
      pool.upsert(save);
    });
    afterEach(() => {
      pool.clear();
      pagingStore.setState((state) => ({ ...state, hasMore: true }));
    });

    it("lays out every filter field exactly once", () => {
      const fields = FILTER_MENU.flat().flatMap(entryFields);
      expect([...fields].sort()).toEqual(
        FILTER_SECTIONS.flatMap((section) => [...section.fields]).sort(),
      );
    });

    it("groups the long tail and hides media fields the library lacks", async () => {
      await render();
      await act(async () => button("Add Filter").click());
      const labels = menuItems().map((node) => node.textContent);
      expect(labels).toEqual(
        expect.arrayContaining(["Tags", "Dates", "Image", "File", "Text"]),
      );
      for (const absent of ["Camera", "Fonts", "Audio & Video", "Date Saved"]) {
        expect(labels).not.toContain(absent);
      }
    });

    it("lifts grouped fields into the root search with their group", async () => {
      await render();
      await act(async () => button("Add Filter").click());
      await type("aspe");
      expect(menuItems().map((node) => node.textContent)).toEqual([
        "Image›Aspect",
      ]);
    });

    it("keeps every field while the library is still loading", async () => {
      pagingStore.setState((state) => ({ ...state, hasMore: true }));
      await render();
      await act(async () => button("Add Filter").click());
      expect(menuItems().map((node) => node.textContent)).toContain("Camera");
    });

    function menuItems() {
      return [
        ...document.querySelectorAll<HTMLElement>(
          '[role="menuitem"], [role="menuitemcheckbox"]',
        ),
      ];
    }

    async function type(text: string) {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Add Filter"]',
      );
      if (!input) throw new Error("Missing Add Filter input");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    it("keeps applied filters in a menu instead of a chip row", async () => {
      await render();
      expect(button("Add Filter")).toBeTruthy();
      expect(() => button("1 Filter")).toThrow();
      await act(async () =>
        setSearchInput(
          [{ field: "type", operator: "eq", value: "video" }],
          "",
          "type:video",
        ),
      );
      expect(host.querySelector("fieldset")).toBeNull();
      await act(async () => button("1 Filter").click());
      const labels = menuItems().map((node) => node.textContent);
      expect(labels.some((label) => label?.startsWith("Type"))).toBe(true);
      expect(labels).toEqual(
        expect.arrayContaining(["Save View", "Clear Filters"]),
      );
      const clear = menuItems().find(
        (node) => node.textContent === "Clear Filters",
      );
      await act(async () => clear?.click());
      expect(state().query.rules).toEqual([]);
    });

    it("lists fields directly and hides ones already applied", async () => {
      setSearchInput(
        [{ field: "type", operator: "eq", value: "video" }],
        "",
        "type:video",
      );
      await render();
      expect(button("1 Filter")).toBeTruthy();
      await act(async () => button("Add Filter").click());
      const labels = menuItems().map((node) => node.textContent);
      expect(labels).toContain("Tags");
      expect(labels).toContain("Visual Match");
      expect(labels).not.toContain("Type");
      const tags = menuItems().find((node) => node.textContent === "Tags");
      expect(tags?.hasAttribute("aria-haspopup")).toBe(true);
    });

    it("finds values across fields and applies them from the root search", async () => {
      await render();
      await act(async () => button("Add Filter").click());
      await type("you");
      const youtube = menuItems().find((node) =>
        node.textContent?.includes("YouTube"),
      );
      expect(youtube?.textContent).toBe("Source›YouTube1");
      await act(async () => youtube?.click());
      expect(state().query.rules).toEqual([
        { field: "source", operator: "eq", value: "youtube.com" },
      ]);
    });

    it("skips mid-word matches and values with no saves", async () => {
      await render();
      await act(async () => button("Add Filter").click());
      await type("tube");
      expect(
        menuItems().some((node) => node.textContent?.includes("YouTube")),
      ).toBe(false);
      await type("vim");
      expect(
        menuItems().some((node) => node.textContent?.includes("Vimeo")),
      ).toBe(false);
    });

    it("matches field names by letters in order", async () => {
      await render();
      await act(async () => button("Add Filter").click());
      await type("sor");
      expect(menuItems().map((node) => node.textContent)).toEqual(["Source"]);
    });
  });
});
