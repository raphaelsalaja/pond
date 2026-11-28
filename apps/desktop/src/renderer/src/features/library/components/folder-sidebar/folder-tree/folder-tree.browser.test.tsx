import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { folders } from "@/features/library/state/folders";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import { getViewState } from "@/features/library/state/view-store";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { createFolderSidebarHarness, folder } from "../test-harness";

async function movePointerAway() {
  await cdp().send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.max(0, window.innerWidth - 1),
    y: Math.max(0, window.innerHeight - 1),
  });
}

function isHTMLElement(element: Element | null): element is HTMLElement {
  return element?.namespaceURI === "http://www.w3.org/1999/xhtml";
}

function clearFocus() {
  const active = document.activeElement;
  if (isHTMLElement(active)) {
    active.blur();
  }
}

function pointer(type: string, clientY: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: 20,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  return event;
}

/**
 * dnd-kit swallows document clicks for a moment after a drop, to eat the
 * click a real pointerup makes. Waits until a click reaches its target again
 * so the next test's clicks aren't lost.
 */
async function clicksReachTargets(): Promise<void> {
  const probe = document.createElement("button");
  let reached = false;
  probe.addEventListener("click", () => {
    reached = true;
  });
  document.body.append(probe);
  try {
    await vi.waitFor(() => {
      probe.click();
      expect(reached).toBe(true);
    });
  } finally {
    probe.remove();
  }
}

function option(label: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) {
    throw new Error(`Missing customization option: ${label}`);
  }
  return button;
}

function row(label: string) {
  return [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.startsWith(label),
  );
}

function sortedLabels(root: ParentNode, rowLabel: (node: Element) => string) {
  return [...root.querySelectorAll("button")].flatMap((button) => {
    const label = rowLabel(button);
    return label === "Alpha" || label === "Zulu" ? [label] : [];
  });
}

describe("folder sidebar tree", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  it("starts inline naming from the shared folder state", async () => {
    harness.set({ folders: [folder("Untitled")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => folders.startEditing("Untitled"));
    const input = harness.host.querySelector<HTMLInputElement>(
      'input[aria-label="Folder name"]',
    );
    expect(input?.value).toBe("Untitled");
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe("Untitled".length);
  });

  it("selects folder ranges, browses their union, and preserves a batch context menu", async () => {
    harness.set({
      folders: [folder("Alpha"), folder("Beta"), folder("Charlie")],
    });
    await folders.refresh();
    await harness.mount();
    await act(async () => harness.button("Alpha").click());
    await act(async () =>
      harness
        .button("Charlie")
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true }),
        ),
    );
    expect(
      [
        ...harness.host.querySelectorAll(
          '[role="treeitem"][aria-selected="true"]',
        ),
      ].map((row) => row.getAttribute("data-tree-id")),
    ).toEqual(["Alpha", "Beta", "Charlie"]);
    expect(
      harness.host.querySelectorAll('[role="treeitem"][aria-current="page"]'),
    ).toHaveLength(0);
    expect(getViewState().query.rules).toEqual([
      {
        field: "folder",
        operator: "some",
        value: ["Alpha", "Beta", "Charlie"],
      },
    ]);
    await act(async () =>
      harness.button("Beta").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(harness.menuItem("Move 3 Folders To")).toBeDefined();
    expect(harness.menuItem("Batch Rename Folders")).toBeDefined();
  });

  it("supports ranges and bulk context operations in Quick Access", async () => {
    harness.set({ folders: [folder("Quick Alpha"), folder("Quick Beta")] });
    await folders.refresh();
    await saveFolderPresentation("Quick Alpha", { quickAccess: true });
    await saveFolderPresentation("Quick Beta", { quickAccess: true });
    await harness.mount();
    await act(async () => harness.button("Quick Alpha").click());
    await act(async () =>
      harness
        .button("Quick Beta")
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true }),
        ),
    );
    const quickTree = harness.host.querySelector(
      '[role="tree"][aria-label="Quick Access"]',
    );
    expect(quickTree?.querySelectorAll('[aria-selected="true"]')).toHaveLength(
      2,
    );
    await act(async () =>
      harness.button("Quick Alpha").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(harness.menuItem("Open 2 Selected Items")).toBeDefined();
  });

  it("keeps collapsed folder content out of the keyboard tree", async () => {
    harness.set({ folders: [folder("Alpha")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => harness.button("Folders").click());
    const tree = harness.host.querySelector(
      '[role="tree"][aria-label="Folders"]',
    );
    expect(tree?.hasAttribute("inert")).toBe(true);
    expect(tree?.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens a searchable folder context menu with Eagle operations", async () => {
    harness.set({ folders: [folder("Shots")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => {
      harness.button("Shots").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    const items = [...document.querySelectorAll('[role="menuitem"]')].map(
      (node) => node.textContent?.trim() ?? "",
    );
    for (const label of [
      "New Folder",
      "New Subfolder",
      "Move To",
      "Rename",
      "Set Auto-Tag",
      "Duplicate",
      "Export",
      "Add to Other Library",
      "Customize Folder",
      "Remove Folder",
    ]) {
      expect(items.some((item) => item.includes(label))).toBe(true);
    }
    expect(items.some((item) => item === "Delete")).toBe(false);
    expect(document.body.textContent).toContain("Quick Access");
    expect(items.some((item) => item.includes("Sort By"))).toBe(true);
    expect(items.some((item) => item.includes("Customize Folder"))).toBe(true);
    expect(items.some((item) => item.includes("Icon"))).toBe(true);
    expect(items.some((item) => item.includes("Color"))).toBe(true);
    expect(
      document.querySelector('[aria-label="Search folder operations"]'),
    ).not.toBeNull();
  });

  it("opens the shared visibility menu from a built-in row", async () => {
    await harness.mount();
    await act(async () => {
      harness.button("Uncategorized").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    for (const label of ["Visibility", "Badge", "Customize Sidebar"]) {
      expect(harness.menuItem(label)).toBeDefined();
    }
  });

  it("makes visible built-in destinations directly sortable", async () => {
    await harness.mount();
    expect(
      [...harness.host.querySelectorAll("[data-sidebar-sortable]")].map((row) =>
        row.getAttribute("data-sidebar-sortable"),
      ),
    ).toEqual([
      "all",
      "uncategorized",
      "untagged",
      "recentlyAdded",
      "recentlyUsed",
      "random",
      "splitPosts",
      "trash",
    ]);
  });

  it("hands a dropped sidebar row to its new layout without snap-back motion", async () => {
    await harness.mount();
    const [first, , , fourth] = [
      ...harness.host.querySelectorAll<HTMLElement>("[data-sidebar-sortable]"),
    ].map((row) => row.getBoundingClientRect());
    if (!first || !fourth) {
      throw new Error("Expected sortable sidebar rows");
    }
    const start = first.top + first.height / 2;
    const end = fourth.top + fourth.height / 2;
    const shift = fourth.top + fourth.height - (first.top + first.height);
    const all = harness.button("All");
    const allRow = all.closest<HTMLElement>("[data-sidebar-sortable]");
    if (!allRow) {
      throw new Error("Expected the All row to be sortable");
    }
    const transitions: Array<string> = [];
    const observer = new MutationObserver(() => {
      transitions.push(allRow.style.transition);
    });
    observer.observe(allRow, {
      attributes: true,
      attributeFilter: ["style"],
    });

    await act(async () => {
      all.dispatchEvent(pointer("pointerdown", start));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", start + 10));
    });
    expect(allRow?.hasAttribute("data-dragging")).toBe(true);
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", end));
    });
    expect(allRow?.style.transform).toContain(`${shift}px`);
    await act(async () => {
      document.dispatchEvent(pointer("pointerup", end));
    });
    observer.disconnect();

    expect(
      [...harness.host.querySelectorAll("[data-sidebar-sortable]")].map((row) =>
        row.getAttribute("data-sidebar-sortable"),
      ),
    ).toEqual([
      "uncategorized",
      "untagged",
      "recentlyAdded",
      "all",
      "recentlyUsed",
      "random",
      "splitPosts",
      "trash",
    ]);
    // Chromium serializes dnd-kit's "transform 0ms linear" without the zero duration.
    const instant = document.createElement("div").style;
    instant.transition = "transform 0ms linear";
    expect(transitions).toContain(instant.transition);
    await clicksReachTargets();
  });

  it("opens Quick Access folder operations from its row", async () => {
    harness.set({ folders: [folder("Shots")] });
    await folders.refresh();
    await saveFolderPresentation("Shots", {
      quickAccess: true,
      quickAccessOrder: 0,
    });
    await harness.mount();
    const rows = [...harness.host.querySelectorAll("button")].filter(
      (button) => button.textContent?.replace(/[\d,]+$/, "").trim() === "Shots",
    );
    const quickRow = rows[0];
    if (!quickRow) {
      throw new Error("Missing Quick Access folder");
    }
    await act(async () => {
      quickRow.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    expect(harness.menuItem("Remove from Quick Access")).toBeDefined();
    expect(harness.menuItem("Move Up")).toBeDefined();
    expect(harness.menuItem("Move Down")).toBeDefined();
    await saveFolderPresentation("Shots", { quickAccess: false });
  });

  it("opens Recently Used and Random destinations", async () => {
    const router = await harness.mount();
    await act(async () => harness.button("Recently Used").click());
    expect(router.state.location.pathname).toBe("/recents");
    expect(getLibraryNav()).toEqual({ kind: "recents" });
    await act(async () => harness.button("Random").click());
    expect(router.state.location.pathname).toBe("/random");
    expect(getLibraryNav()).toEqual({ kind: "random" });
  });

  it("opens folder customization in a dialog", async () => {
    harness.set({ folders: [folder("Shots")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => {
      harness.button("Shots").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    await act(async () => harness.menuItem("Customize Folder").click());
    // The searchable context menu is also a dialog, mounted while it animates out.
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][data-open]',
    );
    if (!dialog) {
      throw new Error("Missing customization dialog");
    }
    expect(dialog.getAttribute("aria-label")).toBe("Customize Folder");

    await act(async () => option("Icon and Color").click());
    expect(
      document.querySelector(
        'button[aria-label="Folder"][aria-pressed="true"]',
      ),
    ).not.toBeNull();
    await act(async () => option("Album").click());
    await act(async () => option("Pink").click());
    const description = dialog.querySelector("textarea");
    if (!description) {
      throw new Error("Missing folder description");
    }
    expect(dialog.querySelector('input[type="url"]')).toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(description, "Reference material");
      description.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () =>
      [...dialog.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.trim() === "Save")
        ?.click(),
    );

    expect(window.pond.query).toHaveBeenCalledWith("folders.setColor", {
      id: "Shots",
      color: "pink",
    });
    expect(window.pond.query).toHaveBeenCalledWith(
      "settings.setPrefs",
      expect.objectContaining({
        folderViews: expect.objectContaining({
          Shots: expect.objectContaining({ icon: "album" }),
        }),
      }),
    );
    expect(window.pond.query).toHaveBeenCalledWith("folders.metadata.set", {
      folderId: "Shots",
      description: "Reference material",
      externalLink: "https://example.com/project",
    });
  });

  it("sorts the folder list from the Folders group header menu", async () => {
    harness.set({ folders: [folder("Zulu"), folder("Alpha")] });
    await folders.refresh();
    await harness.mount();

    expect(
      sortedLabels(harness.host, (node) => harness.rowLabel(node)),
    ).toEqual(["Zulu", "Alpha"]);

    await act(async () => {
      harness.button("Folders").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    expect(harness.menuItem("Sort By")).toBeDefined();
    await act(async () => harness.menuItem("Sort By").click());
    await act(async () => harness.menuItem("Title").click());

    expect(
      sortedLabels(harness.host, (node) => harness.rowLabel(node)),
    ).toEqual(["Alpha", "Zulu"]);
    expect(localStorage.getItem("pond:folder-list-sort")).toBe("title");
  });

  it("opens the removal confirmation and deletes the folder", async () => {
    harness.set({ folders: [folder("Shots")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => {
      harness.button("Shots").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    await act(async () => harness.menuItem("Remove Folder").click());
    const checkbox = await vi.waitFor(() => {
      const node = document.querySelector<HTMLElement>('[role="checkbox"]');
      if (!node) {
        throw new Error("Missing Trash checkbox");
      }
      return node;
    });
    await act(async () => checkbox.click());
    const remove = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    );
    expect(remove).toBeDefined();
    await act(async () => remove?.click());
    expect(window.pond.query).toHaveBeenCalledWith("folders.delete", {
      id: "Shots",
      trashContainedSaves: true,
    });
  });

  it("places folder carets beside the folder icon and collapses nested rows", async () => {
    harness.set({
      folders: [
        folder("Travel"),
        folder("Tickets", "Travel"),
        folder("Receipts", "Travel"),
      ],
    });
    await folders.refresh();
    await harness.mount();
    const toggle = harness.iconButton("Collapse Travel");
    const expandedCaret = toggle.querySelector("svg");
    if (!expandedCaret) {
      throw new Error("Missing expanded disclosure caret");
    }
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(getComputedStyle(expandedCaret).transform).not.toBe("none");
    expect(harness.button("Travel").contains(toggle)).toBe(false);
    expect(harness.button("Tickets")).toBeDefined();
    expect(harness.button("Receipts")).toBeDefined();
    expect(() => harness.iconButton("Collapse Tickets")).toThrow(
      "Missing icon button: Collapse Tickets",
    );
    const navigation = getLibraryNav();
    await act(async () => toggle.click());
    const collapsedToggle = harness.iconButton("Expand Travel");
    const collapsedCaret = collapsedToggle.querySelector("svg");
    if (!collapsedCaret) {
      throw new Error("Missing collapsed disclosure caret");
    }
    expect(collapsedToggle.getAttribute("aria-expanded")).toBe("false");
    expect(getLibraryNav()).toEqual(navigation);
    await vi.waitFor(() => {
      expect(getComputedStyle(collapsedCaret).transform).toBe("none");
    });
    expect(() => harness.button("Tickets")).toThrow(
      "Missing sidebar button: Tickets",
    );
    expect(() => harness.button("Receipts")).toThrow(
      "Missing sidebar button: Receipts",
    );
  });

  it("reveals the disclosure on row hover and focus without a second tab stop", async () => {
    harness.set({ folders: [folder("Travel"), folder("Tickets", "Travel")] });
    await folders.refresh();
    await harness.mount();
    clearFocus();
    await movePointerAway();
    const row = harness.button("Travel");
    const toggle = harness.iconButton("Collapse Travel");
    const icon = row.querySelector("svg");
    if (!icon?.parentElement) {
      throw new Error("Missing folder artwork");
    }
    const artwork = icon.parentElement;
    expect(toggle.tabIndex).toBe(-1);
    expect(getComputedStyle(toggle).opacity).toBe("0");
    expect(getComputedStyle(artwork).opacity).toBe("1");

    await userEvent.hover(row);
    await vi.waitFor(() => {
      expect(getComputedStyle(toggle).opacity).toBe("1");
      expect(getComputedStyle(artwork).opacity).toBe("0");
    });

    expect(toggle.getAttribute("data-variant")).toBe("ghost");
    await userEvent.hover(toggle);
    expect(toggle.matches(":hover")).toBe(true);

    await movePointerAway();
    await vi.waitFor(() => {
      expect(getComputedStyle(toggle).opacity).toBe("0");
      expect(getComputedStyle(artwork).opacity).toBe("1");
    });

    const leafRow = harness.button("Tickets");
    const leafIcon = leafRow.querySelector("svg");
    if (!leafIcon?.parentElement) {
      throw new Error("Missing leaf folder artwork");
    }
    await userEvent.hover(leafRow);
    expect(leafRow.closest("[data-has-children]")).toBeNull();
    expect(getComputedStyle(leafIcon.parentElement).opacity).toBe("1");
    expect(() => harness.iconButton("Collapse Tickets")).toThrow(
      "Missing icon button: Collapse Tickets",
    );
    await movePointerAway();

    row.focus();
    await vi.waitFor(() => {
      expect(getComputedStyle(toggle).opacity).toBe("1");
      expect(getComputedStyle(artwork).opacity).toBe("0");
    });
    expect(document.activeElement).toBe(row);
    row.blur();
  });

  it("swaps custom icons and cover images only on their hovered rows", async () => {
    harness.set({
      folders: [
        folder("Custom"),
        folder("Nested Custom", "Custom"),
        folder("Covered"),
        folder("Nested Covered", "Covered"),
      ],
    });
    await folders.refresh();
    await saveFolderPresentation("Custom", { icon: "camera" });
    const cover = wireSave({
      id: "cover-save",
      mediaType: "image",
      files: [
        {
          kind: "cover",
          path: "photo.png",
          mimeType: "image/png",
          sha256: "cover-sha256",
          size: 1,
        },
      ],
    });
    bridge.use({
      query: {
        "saves.get": ({ id }) => (id === "cover-save" ? cover : null),
      },
    });
    await saveFolderPresentation("Covered", { coverSaveId: "cover-save" });
    await harness.mount();
    clearFocus();
    await movePointerAway();

    const customRow = harness.button("Custom");
    const coveredRow = harness.button("Covered");
    const customIcon = customRow.querySelector("svg");
    if (!customIcon?.parentElement) {
      throw new Error("Missing custom folder artwork");
    }
    const customArtwork = customIcon.parentElement;
    await vi.waitFor(() => {
      expect(coveredRow.querySelector("img")).not.toBeNull();
    });
    const coverImage = coveredRow.querySelector("img");
    if (!coverImage?.parentElement) {
      throw new Error("Missing folder cover image");
    }
    const coverArtwork = coverImage.parentElement;
    expect(coverImage.getAttribute("src")).toContain(
      "pond://cover-save/photo.png",
    );
    const customToggle = harness.iconButton("Collapse Custom");
    const coverToggle = harness.iconButton("Collapse Covered");
    await vi.waitFor(() => {
      expect(getComputedStyle(customToggle).opacity).toBe("0");
      expect(getComputedStyle(coverToggle).opacity).toBe("0");
    });

    await userEvent.hover(customRow);
    await vi.waitFor(() => {
      expect(getComputedStyle(customToggle).opacity).toBe("1");
      expect(getComputedStyle(customArtwork).opacity).toBe("0");
    });
    expect(getComputedStyle(coverToggle).opacity).toBe("0");
    expect(getComputedStyle(coverArtwork).opacity).toBe("1");

    await movePointerAway();
    await userEvent.hover(coveredRow);
    await vi.waitFor(() => {
      expect(getComputedStyle(coverToggle).opacity).toBe("1");
      expect(getComputedStyle(coverArtwork).opacity).toBe("0");
      expect(getComputedStyle(customToggle).opacity).toBe("0");
      expect(getComputedStyle(customArtwork).opacity).toBe("1");
    });
  });

  it("expands a collapsed folder so a new subfolder can be named", async () => {
    harness.set({ folders: [folder("Travel"), folder("Tickets", "Travel")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => harness.iconButton("Collapse Travel").click());
    expect(() => harness.button("Tickets")).toThrow(
      "Missing sidebar button: Tickets",
    );

    await act(async () => {
      harness.button("Travel").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    const created = folder("Untitled", "Travel");
    bridge.use({
      query: {
        "folders.create": () => {
          harness.set({ folders: [...harness.fixtures.folders, created] });
          return created;
        },
      },
    });
    await act(async () => harness.menuItem("New Subfolder").click());

    await vi.waitFor(() => {
      const input = harness.host.querySelector<HTMLInputElement>(
        'input[aria-label="Folder name"]',
      );
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(document.activeElement).toBe(input);
    });
    const input = harness.host.querySelector<HTMLInputElement>(
      'input[aria-label="Folder name"]',
    );
    if (!input) {
      throw new Error("Missing folder name input");
    }
    expect(input.value).toBe("Untitled");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Untitled".length);
    expect(
      harness.iconButton("Collapse Travel").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(harness.button("Tickets")).toBeDefined();
    expect(window.pond.query).toHaveBeenCalledWith("folders.create", {
      name: "Untitled",
      parentId: "Travel",
    });
  });

  it("opens collapsed ancestors when a nested folder is named", async () => {
    harness.set({
      folders: [
        folder("Travel"),
        folder("Europe", "Travel"),
        folder("Notes", "Europe"),
      ],
    });
    localStorage.setItem(
      "pond:collapsed-folders",
      JSON.stringify(["Travel", "Europe"]),
    );
    await folders.refresh();
    await harness.mount();
    expect(() => harness.button("Europe")).toThrow(
      "Missing sidebar button: Europe",
    );
    expect(() => harness.button("Notes")).toThrow(
      "Missing sidebar button: Notes",
    );

    await act(async () => folders.startEditing("Notes"));

    await vi.waitFor(() => {
      const input = harness.host.querySelector<HTMLInputElement>(
        'input[aria-label="Folder name"]',
      );
      expect(input?.value).toBe("Notes");
      expect(document.activeElement).toBe(input);
    });
    expect(
      harness.iconButton("Collapse Travel").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      harness.iconButton("Collapse Europe").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("opens folder operations from the disclosure button", async () => {
    harness.set({ folders: [folder("Travel"), folder("Tickets", "Travel")] });
    await folders.refresh();
    await harness.mount();
    await act(async () => {
      harness.iconButton("Collapse Travel").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    expect(harness.menuItem("Customize Folder")).toBeDefined();
    expect(harness.menuItem("Sort By")).toBeDefined();
  });

  it("shows positive counts only at visible folder branch boundaries", async () => {
    harness.set({
      folders: [
        folder("Jil Sander"),
        folder("Runway Year", "Jil Sander"),
        folder("Autumn Winter", "Runway Year"),
        folder("Archive", "Jil Sander"),
        folder("Empty", "Jil Sander"),
      ],
      sidebarCounts: {
        library: 6006,
        uncategorized: 0,
        untagged: 0,
        recentlyAdded: 0,
        recentlyUsed: 0,
        splitPosts: 0,
        trash: 0,
        inbox: 0,
        inboxSnoozed: 0,
        folders: {
          "Jil Sander": 6006,
          "Runway Year": 206,
          "Autumn Winter": 206,
          Archive: 5800,
          Empty: 0,
        },
        foldersDownloading: {},
      },
    });
    await folders.refresh();
    await harness.mount();

    expect(harness.button("Jil Sander").textContent).not.toContain("6,006");
    expect(harness.button("Runway Year").textContent).not.toContain("206");
    expect(harness.button("Autumn Winter").textContent).toContain("206");
    expect(harness.button("Archive").textContent).toContain("5,800");
    expect(harness.button("Empty").textContent).toBe("Empty");

    await act(async () => harness.iconButton("Collapse Runway Year").click());
    expect(harness.button("Runway Year").textContent).toContain("206");
    expect(() => harness.button("Autumn Winter")).toThrow(
      "Missing sidebar button: Autumn Winter",
    );
    expect(harness.button("Jil Sander").textContent).not.toContain("6,006");

    await act(async () => harness.iconButton("Collapse Jil Sander").click());
    expect(harness.button("Jil Sander").textContent).toContain("6,006");
    expect(() => harness.button("Runway Year")).toThrow(
      "Missing sidebar button: Runway Year",
    );
  });

  it("marks folders whose saves are still downloading", async () => {
    harness.set({
      folders: [
        folder("Pinterest"),
        folder("Kitchens", "Pinterest"),
        folder("Gardens", "Pinterest"),
      ],
      sidebarCounts: {
        library: 3,
        uncategorized: 0,
        untagged: 0,
        recentlyAdded: 0,
        recentlyUsed: 0,
        splitPosts: 0,
        trash: 0,
        inbox: 0,
        inboxSnoozed: 0,
        folders: { Pinterest: 3, Gardens: 3 },
        foldersDownloading: { Pinterest: 12, Kitchens: 12 },
      },
    });
    await folders.refresh();
    await harness.mount();
    expect(row("Kitchens")?.textContent).toBe("Kitchens12 downloading");
    expect(
      row("Kitchens")?.querySelector("[title]")?.getAttribute("title"),
    ).toBe("12 downloading");
    expect(row("Gardens")?.textContent).toBe("Gardens3");
    expect(row("Pinterest")?.textContent).toBe("Pinterest");

    await act(async () => harness.iconButton("Collapse Pinterest").click());
    expect(row("Pinterest")?.textContent).toBe("Pinterest12 downloading3");
  });
});
