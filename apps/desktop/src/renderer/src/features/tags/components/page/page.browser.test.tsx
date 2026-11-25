import type { Tag } from "@pond/schema/db";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { isHTMLElement, isHTMLTag } from "@pond/ui/dom";
import { RouterProvider } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLibraryTestRouter } from "@/app/test/library-router";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import {
  getViewState,
  resetFilters,
  setQuery,
} from "@/features/library/state/view-store";
import { startViewUrlSync } from "@/features/library/state/view-url";
import { tagCreation } from "@/features/tags/state/creation";
import { tagsScope } from "@/features/tags/state/tags-scope";
import { bridge } from "@/shared/test/pond-bridge";
import { TagsSidebar } from "../sidebar";
import { TagsPage } from "./";

const fixtures = {
  tags: ["Animation", "Typography"].map((name, index) => ({
    id: String(index),
    name,
    starred: index === 0,
    archived: false,
    description: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(0),
  })) satisfies Array<Tag>,
  groups: [
    {
      id: "design",
      name: "Design",
      description: "Visual references",
      color: null,
      sortOrder: 0,
      collapsed: false,
      createdAt: new Date(0),
      tagIds: ["0"],
      tagNames: ["Animation"],
    },
  ],
  saves: [],
};

async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

describe("library Tags page", () => {
  let host: HTMLDivElement;
  let root: Root;
  let stopViewUrlSync: (() => void) | null = null;
  const createdTags = new Set(["animation", "typography"]);
  const createAttempts: Array<string> = [];

  beforeEach(() => {
    bridge.use({
      query: {
        "tags.list": () => fixtures.tags,
        "tagGroups.list": () => fixtures.groups,
        "tags.create": async ({ name }) => {
          createAttempts.push(name);
          const tagName = name.toLowerCase();
          if (createdTags.has(tagName)) {
            throw new Error("UNIQUE constraint failed: tags.name");
          }
          createdTags.add(tagName);
          return { ok: true };
        },
        "tagGroups.create": () => ({ ok: true }),
        "tagGroups.update": () => ({ ok: true }),
        "tagGroups.addTags": ({ tags }) => ({
          ok: true,
          affected: tags.length,
        }),
      },
    });
    createAttempts.length = 0;
    createdTags.clear();
    createdTags.add("animation");
    createdTags.add("typography");
    host = document.createElement("div");
    host.style.display = "flex";
    host.style.width = "900px";
    host.style.height = "800px";
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    stopViewUrlSync?.();
    stopViewUrlSync = null;
    host.remove();
    tagsScope.set("all");
    resetFilters();
  });

  async function mount() {
    const router = createLibraryTestRouter("/tags");
    /** SAFETY: every value in `routesById` is a route; this only widens its id keys to `string`. */
    const tagsRoute = (router.routesById as Record<string, AnyRoute>)[
      "/_library/tags"
    ];
    if (!tagsRoute) {
      throw new Error("Missing Tags route");
    }
    tagsRoute.update({
      component: () => (
        <>
          <TagsSidebar />
          <TagsPage />
        </>
      ),
    });
    await act(async () => {
      await router.load();
      stopViewUrlSync = startViewUrlSync(router);
      root.render(<RouterProvider router={router} />);
    });
    return router;
  }

  it("renders tag navigation and rows from the real stores", async () => {
    await mount();
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "All",
    );
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).toContain("Typography");
    expect(host.textContent).toContain("Starred");
    expect(host.querySelector('[aria-label="New Group"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="New Tag"]')).not.toBeNull();
  });

  it("filters tags using the existing manager", async () => {
    await mount();
    const search = host.querySelector('input[placeholder="Search…"]');
    if (!isHTMLTag(search, "input")) {
      throw new Error("Missing search");
    }
    await fill(search, "animation");
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).not.toContain("Typography");
  });

  it("filters to starred tags from the Eagle-style rail", async () => {
    await mount();
    const starred = [...host.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Starred"),
    );
    if (!starred) {
      throw new Error("Missing Starred collection");
    }
    await act(async () => starred.click());
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).not.toContain("Typography");
  });

  it("shows group details and its add-tags picker trigger", async () => {
    await mount();
    const group = [...host.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Design1",
    );
    if (!group) {
      throw new Error("Missing Design group");
    }
    await act(async () => group.click());
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "Design",
    );
    expect(
      host.querySelector('[aria-label="Add Tags to Design"]'),
    ).not.toBeNull();
    const description = host.querySelector('[aria-label="Design description"]');
    if (!isHTMLTag(description, "input")) {
      throw new Error("Missing group description");
    }
    await act(async () => description.focus());
    await fill(description, "Changed");
    await act(async () => {
      description.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "tagGroups.update",
      expect.anything(),
    );
    await act(async () => description.focus());
    await fill(description, "Updated");
    await act(async () => {
      description.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(window.pond.query).toHaveBeenCalledWith("tagGroups.update", {
      name: "Design",
      patch: { description: "Updated" },
    });
  });

  it("opens tagged saves from a tag click", async () => {
    const router = await mount();
    setQuery({
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: ["Other"] }],
    });
    const row = host.querySelector('[role="option"][title="Typography"]');
    const more = row?.querySelector('[aria-label="More Actions"]');
    if (!isHTMLElement(row) || !isHTMLElement(more)) {
      throw new Error("Missing Typography");
    }

    await act(async () => more.click());
    expect(router.state.location.pathname).toBe("/tags");

    await act(async () => row.click());
    expect(row.getAttribute("aria-selected")).toBe("false");
    expect(getLibraryNav()).toEqual({ kind: "tag", name: "Typography" });
    expect(router.state.location.pathname).toBe("/tags/Typography");
    expect(getViewState().query).toEqual(EMPTY_QUERY);
  });

  it("opens tagged saves from the keyboard", async () => {
    const router = await mount();
    const row = host.querySelector('[role="option"][title="Animation"]');
    if (!isHTMLElement(row)) {
      throw new Error("Missing Animation");
    }
    await act(async () => {
      row.focus();
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(getLibraryNav()).toEqual({ kind: "tag", name: "Animation" });
    expect(router.state.location.pathname).toBe("/tags/Animation");
  });

  it("selects a tag only with Shift-click and shows no checkbox", async () => {
    const router = await mount();
    const row = host.querySelector('[role="option"]');
    const checkbox = host.querySelector('[aria-label="Select Animation"]');
    if (!isHTMLTag(row, "div")) {
      throw new Error("Missing tag row");
    }

    expect(checkbox).toBeNull();
    expect(row.firstElementChild?.textContent).toContain("Animation");
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(router.state.location.pathname).toBe("/tags");
    expect(host.querySelector('[role="option"][title="Animation"]')).toBe(row);
  });

  it("supports New Group on the library page", async () => {
    await mount();
    const button = [...host.querySelectorAll("button")].find(
      (node) =>
        node.textContent === "New Group" ||
        node.getAttribute("aria-label") === "New Group",
    );
    if (!button) {
      throw new Error("Missing New Group");
    }
    await act(async () => button.click());
    const draft = host.querySelector('input[placeholder="Group name"]');
    if (!isHTMLTag(draft, "input")) {
      throw new Error("Missing draft");
    }
    await fill(draft, "Design");
    await act(async () => {
      draft.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(window.pond.query).toHaveBeenCalledWith("tagGroups.create", {
      name: "Design",
    });
  });

  it("opens the inline draft requested from global New Tag actions", async () => {
    tagCreation.request("tag");
    await mount();
    expect(host.querySelector('input[aria-label="Tag name"]')).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("adds a tag created from a group's picker to that group", async () => {
    await mount();
    const group = [...host.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Design1",
    );
    if (!group) {
      throw new Error("Missing Design group");
    }
    await act(async () => group.click());

    const trigger = host.querySelector('[aria-label="Add Tags to Design"]');
    if (!isHTMLElement(trigger)) {
      throw new Error("Missing Add Tags trigger");
    }
    await act(async () => trigger.click());

    const picker = document.body.querySelector(
      'input[placeholder="Search…"]:not([data-tags-search])',
    );
    if (!isHTMLTag(picker, "input")) {
      throw new Error("Missing tag picker");
    }
    await fill(picker, "Brand");
    await act(async () => {
      picker.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(createAttempts).toEqual(["Brand"]);
    expect(window.pond.query).toHaveBeenCalledWith("tagGroups.addTags", {
      tags: ["Brand"],
      group: "Design",
    });
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "Design",
    );
  });

  it("creates a new tag inside the group you are viewing", async () => {
    await mount();
    const group = [...host.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Design1",
    );
    if (!group) {
      throw new Error("Missing Design group");
    }
    await act(async () => group.click());

    await act(async () => tagCreation.request("tag"));

    const draft = host.querySelector('input[placeholder="Tag name"]');
    if (!isHTMLTag(draft, "input")) {
      throw new Error("Missing tag draft");
    }
    await fill(draft, "Motion");
    await act(async () => {
      draft.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(window.pond.query).toHaveBeenCalledWith("tags.create", {
      name: "Motion",
    });
    expect(window.pond.query).toHaveBeenCalledWith("tagGroups.addTags", {
      tags: ["Motion"],
      group: "Design",
    });
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "Design",
    );
  });

  it("offers New Tag in All and creates the tag without leaving it", async () => {
    await mount();
    const newTag = host.querySelector('[aria-label="New Tag"]');
    if (!isHTMLElement(newTag)) {
      throw new Error("Missing New Tag in All");
    }

    await act(async () => newTag.click());
    const draft = host.querySelector('input[placeholder="Tag name"]');
    if (!isHTMLTag(draft, "input")) {
      throw new Error("Missing tag draft");
    }
    await fill(draft, "Reading");
    await act(async () => {
      draft.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(window.pond.query).toHaveBeenCalledWith("tags.create", {
      name: "Reading",
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "tagGroups.addTags",
      expect.anything(),
    );
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "All",
    );
  });

  it("offers New Tag on Uncategorized when it already has tags", async () => {
    await mount();
    const uncategorized = [...host.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Uncategorized1",
    );
    if (!uncategorized) {
      throw new Error("Missing Uncategorized");
    }
    await act(async () => uncategorized.click());

    const newTag = host.querySelector('[aria-label="New Tag"]');
    if (!isHTMLElement(newTag)) {
      throw new Error("Missing New Tag");
    }
    await act(async () => newTag.click());

    const draft = host.querySelector('input[placeholder="Tag name"]');
    if (!isHTMLTag(draft, "input")) {
      throw new Error("Missing tag draft");
    }
    await fill(draft, "Reading");
    await act(async () => {
      draft.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(window.pond.query).toHaveBeenCalledWith("tags.create", {
      name: "Reading",
    });
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain(
      "Uncategorized",
    );
  });
});
