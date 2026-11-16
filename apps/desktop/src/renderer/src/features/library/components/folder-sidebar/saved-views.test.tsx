import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSavedViewPresentation } from "@/features/library/state/saved-view-presentation";
import { savedViews } from "@/features/library/state/saved-views";
import {
  getViewState,
  updateLocalFilters,
} from "@/features/library/state/view-store";
import {
  createFolderSidebarHarness,
  pondQuery,
  savedView,
  savedViewList,
} from "./test-harness";

describe("folder sidebar saved views", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  async function mountUnreadView(): Promise<void> {
    savedViewList.current = [
      {
        ...savedView("view-1", "saved_view"),
        name: "Unread",
      },
    ];
    await savedViews.refresh();
    await harness.mount();
  }

  async function deleteFromMenu(): Promise<void> {
    await act(async () => harness.menuItem("Delete").click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(pondQuery).toHaveBeenCalledWith("savedViews.delete", {
      id: "view-1",
    });
    expect(pondQuery).toHaveBeenCalledWith("savedViews.list", {});
  }

  function setInput(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("renames a saved view inline from the hover menu", async () => {
    await mountUnreadView();
    const more = harness.host.querySelector(
      '[aria-label="More Actions for Unread"]',
    );
    if (!(more instanceof HTMLElement)) throw new Error("Missing More Actions");
    expect(more.dataset.rounding).toBe("full");
    expect(more.dataset.variant).toBe("text");
    await act(async () => more.click());
    await act(async () => harness.menuItem("Rename").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const input = harness.host.querySelector(
      'input[aria-label="Saved View name"]',
    );
    if (!(input instanceof HTMLInputElement))
      throw new Error("Missing inline rename");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Unread");
    await act(async () => {
      setInput(input, "Later");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(pondQuery).toHaveBeenCalledWith("savedViews.rename", {
      id: "view-1",
      name: "Later",
    });
  });

  it("deletes a saved view from the hover menu", async () => {
    await mountUnreadView();
    const more = harness.host.querySelector(
      '[aria-label="More Actions for Unread"]',
    );
    if (!(more instanceof HTMLElement)) throw new Error("Missing More Actions");
    await act(async () => more.click());
    expect(harness.menuItem("Rename").querySelector("svg")).not.toBeNull();
    expect(harness.menuItem("Delete").querySelector("svg")).not.toBeNull();
    expect(harness.menuItem("Delete").dataset.variant).toBe("destructive");
    await deleteFromMenu();
  });

  it("deletes a saved view from the context menu", async () => {
    await mountUnreadView();
    await act(async () => {
      harness.button("Unread").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    const labels = [
      "Edit Filters",
      "Update Saved View",
      "Refresh",
      "Duplicate",
      "Export",
      "Quick Access",
      "Icon",
      "Color",
      "Rename",
      "Batch Rename Smart Folders",
      "Copy Link",
      "Move to Group",
      "Delete",
    ];
    const icons = labels.map((label) => {
      const icon = harness.menuItem(label).querySelector("svg");
      expect(icon, `${label} should have an icon`).not.toBeNull();
      return icon?.innerHTML;
    });
    expect(new Set(icons).size).toBe(labels.length);
    await deleteFromMenu();
  });

  it("opens group operations from the disclosure button", async () => {
    savedViewList.current = [savedView("Branding", "group")];
    await savedViews.refresh();
    await harness.mount();
    await act(async () => {
      harness.iconButton("Collapse Branding").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    expect(harness.menuItem("Duplicate")).toBeDefined();
    expect(harness.menuItem("Quick Access")).toBeDefined();
  });

  it("opens Saved View Quick Access operations from its row", async () => {
    await saveSavedViewPresentation("view-1", {
      quickAccess: true,
      quickAccessOrder: 0,
    });
    await mountUnreadView();
    const rows = [...harness.host.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Unread",
    );
    const quickRow = rows.at(-1);
    if (!quickRow) throw new Error("Missing Quick Access Saved View");
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
    await saveSavedViewPresentation("view-1", { quickAccess: false });
  });

  it.each([
    ["New Smart Folder", "smart_folder"],
    ["New Group", "group"],
  ] as const)(
    "creates and selects %s from Smart Folders",
    async (label, kind) => {
      await harness.mount();
      await act(async () =>
        harness.iconButton("New Smart Folder, Group, or Saved View").click(),
      );
      expect(harness.menuItem("New Smart Folder")).toBeDefined();
      expect(harness.menuItem("New Group")).toBeDefined();
      expect(harness.menuItem("New Saved View")).toBeDefined();
      await act(async () => harness.menuItem(label).click());
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain(label);
      const nameInput = dialog?.querySelector("input");
      if (!nameInput) throw new Error("Missing name input");
      await act(async () => {
        setInput(nameInput, "Untitled");
        const ruleValue = dialog?.querySelector('[aria-label="Name Value"]');
        if (ruleValue instanceof HTMLInputElement) {
          setInput(ruleValue, "qa");
        }
      });
      const create = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (node) => node.textContent === "Create",
      );
      if (!create) throw new Error("Missing Create button");
      pondQuery.mockImplementationOnce(async () => {
        savedViewList.current = [
          { ...savedView("created", kind), name: "Untitled" },
        ];
        return { ok: true, id: "created" };
      });
      await act(async () => create.click());
      expect(pondQuery).toHaveBeenCalledWith(
        "savedViews.create",
        expect.objectContaining({ kind, parentId: null, name: "Untitled" }),
      );
      expect(harness.button("Untitled").getAttribute("aria-current")).toBe(
        "page",
      );
      expect(harness.button("All").getAttribute("aria-current")).toBeNull();
      expect(getViewState().activeViewId).toBe("created");
    },
  );

  it("creates a saved view and names it inline", async () => {
    await harness.mount();
    await act(async () =>
      harness.iconButton("New Smart Folder, Group, or Saved View").click(),
    );
    pondQuery.mockImplementationOnce(async () => {
      savedViewList.current = [
        { ...savedView("created", "saved_view"), name: "Untitled" },
      ];
      return { ok: true, id: "created" };
    });
    await act(async () => harness.menuItem("New Saved View").click());
    await vi.waitFor(() => {
      const input = harness.host.querySelector(
        'input[aria-label="Saved View name"]',
      );
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(document.activeElement).toBe(input);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pondQuery).toHaveBeenCalledWith(
      "savedViews.create",
      expect.objectContaining({
        kind: "saved_view",
        parentId: null,
        name: "Untitled",
      }),
    );
    expect(getViewState().activeViewId).toBe("created");
    const input = harness.host.querySelector(
      'input[aria-label="Saved View name"]',
    );
    if (!(input instanceof HTMLInputElement))
      throw new Error("Missing inline name input");
    pondQuery.mockImplementationOnce(async () => {
      savedViewList.current = [
        { ...savedView("created", "saved_view"), name: "Reading" },
      ];
      return { ok: true };
    });
    await act(async () => {
      setInput(input, "Reading");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(pondQuery).toHaveBeenCalledWith("savedViews.rename", {
      id: "created",
      name: "Reading",
    });
    expect(harness.button("Reading")).toBeDefined();
  });

  it("nests entries in groups and collapses their keyboard targets", async () => {
    savedViewList.current = [
      savedView("Branding", "group"),
      savedView("Images", "smart_folder", "Branding"),
      savedView("Review", "saved_view", "Branding"),
    ];
    await savedViews.refresh();
    await harness.mount();
    await act(async () => harness.button("Images").click());
    expect(harness.button("Images").getAttribute("aria-current")).toBe("page");
    expect(harness.button("All").getAttribute("aria-current")).toBeNull();
    await act(async () => harness.iconButton("Collapse Branding").click());
    expect(
      harness.iconButton("Expand Branding").getAttribute("aria-expanded"),
    ).toBe("false");
    expect(harness.button("Images").closest("[inert]")).not.toBeNull();
    expect(harness.button("Review").closest("[inert]")).not.toBeNull();
    await act(async () => harness.iconButton("Expand Branding").click());
    expect(harness.button("Images").closest("[inert]")).toBeNull();
    await act(async () =>
      harness.iconButton("More Actions for Branding").click(),
    );
    expect(harness.menuItem("New Smart Folder")).toBeDefined();
    expect(harness.menuItem("New Group")).toBeDefined();
    expect(harness.menuItem("New Saved View")).toBeDefined();
  });

  it("leaves the smart folder scope when navigating to another destination", async () => {
    await mountUnreadView();
    await act(async () => harness.button("Unread").click());
    await act(async () => harness.button("Untagged").click());
    expect(getViewState().activeViewId).toBeNull();
    expect(harness.button("Unread").getAttribute("aria-current")).toBeNull();
  });

  it("saves child filters separately from its parent conditions", async () => {
    const group = savedView("Branding", "group");
    group.query = {
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: ["branding"] }],
    };
    savedViewList.current = [
      group,
      savedView("Images", "smart_folder", group.id),
    ];
    await savedViews.refresh();
    await harness.mount();
    await act(async () => harness.button("Images").click());
    const rules = [{ field: "type", operator: "eq", value: "image" }] as const;
    await act(async () => updateLocalFilters([...rules]));
    await act(async () =>
      harness.iconButton("More Actions for Images").click(),
    );
    pondQuery.mockImplementationOnce(async () => {
      savedViewList.current = savedViewList.current.map((view) =>
        view.id === "Images"
          ? { ...view, query: { combinator: "and", rules: [...rules] } }
          : view,
      );
      return { ok: true };
    });
    await act(async () => harness.menuItem("Save Filters").click());
    expect(pondQuery).toHaveBeenCalledWith("savedViews.update", {
      id: "Images",
      patch: { query: { combinator: "and", rules: [...rules] } },
    });
    expect(getViewState().inheritedQuery).toEqual(group.query);
  });
});
