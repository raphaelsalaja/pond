import { PrefsSchema } from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePrefsSection } from "@/shared/state/prefs";
import { sidebarMenuItems } from "./sidebar-menu";
import { createFolderSidebarHarness } from "./test-harness";

function submenu(items: MenuItemSpec[], label: string): MenuItemSpec[] {
  const match = items.find(
    (item) => item.type === "submenu" && item.label === label,
  );
  if (match?.type !== "submenu") throw new Error(`Missing submenu: ${label}`);
  return match.items;
}

function labels(items: MenuItemSpec[]): unknown[] {
  return items.flatMap((item) =>
    item.type === "separator" || item.type === "custom" ? [] : [item.label],
  );
}

describe("sidebarMenuItems", () => {
  const defaults = PrefsSchema.parse({}).sidebar;

  it("toggles sections from the Sections submenu", () => {
    const patch = vi.fn();
    const sections = submenu(
      sidebarMenuItems({ sidebar: defaults, patch, customize: () => {} }),
      "Sections",
    );
    expect(labels(sections)).toEqual([
      "Smart Folders",
      "Fish",
      "Canvases",
      "Folders",
    ]);
    const fish = sections[1];
    if (fish?.type !== "checkbox") throw new Error("Fish isn't a checkbox");
    expect(fish.checked).toBe(true);
    fish.onCheckedChange?.(false);
    expect(patch).toHaveBeenCalledWith({
      sections: { ...defaults.sections, fish: false },
    });
  });

  it("lists hidden destinations and brings them back", () => {
    const patch = vi.fn();
    const sidebar = {
      ...defaults,
      destinations: {
        ...defaults.destinations,
        untagged: false,
        random: false,
      },
    };
    const hidden = submenu(
      sidebarMenuItems({ sidebar, patch, customize: () => {} }),
      "Show Hidden",
    );
    expect(labels(hidden)).toEqual(["Untagged", "Random", "Show All"]);

    const untagged = hidden[0];
    if (untagged?.type !== undefined && untagged?.type !== "item")
      throw new Error("Untagged isn't an action");
    untagged?.onClick?.();
    expect(patch).toHaveBeenLastCalledWith({
      destinations: { ...sidebar.destinations, untagged: true },
    });

    const all = hidden.at(-1);
    if (all?.type !== undefined && all?.type !== "item")
      throw new Error("Show All isn't an action");
    all?.onClick?.();
    expect(patch).toHaveBeenLastCalledWith({
      destinations: { ...sidebar.destinations, untagged: true, random: true },
    });
  });

  it("disables Show Hidden when nothing is hidden", () => {
    const items = sidebarMenuItems({
      sidebar: defaults,
      patch: () => {},
      customize: () => {},
    });
    const hidden = items.find(
      (item) => item.type === "submenu" && item.label === "Show Hidden",
    );
    expect(hidden?.type === "submenu" && hidden.disabled).toBe(true);
  });
});

describe("sidebar background menu", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  const rightClick = async (target: Element) => {
    await act(async () => {
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 400,
        }),
      );
    });
  };

  /** Labels are prefixes since a shortcut glyph can follow the label text. */
  const hasMenuItem = (label: string) =>
    [
      ...document.querySelectorAll(
        '[role="menuitem"], [role="menuitemcheckbox"]',
      ),
    ].some((item) => item.textContent?.trim().startsWith(label));

  it("opens from empty sidebar space", async () => {
    await harness.mount();
    const scroll = harness.host.querySelector('[data-scroll-fade="vertical"]');
    if (!scroll) throw new Error("Missing sidebar scroll");
    await rightClick(scroll);
    for (const label of [
      "Customize Sidebar",
      "Sections",
      "Show Hidden",
      "New Folder",
      "New Smart Folder",
    ]) {
      expect(hasMenuItem(label)).toBe(true);
    }
  });

  it("opens from the Harvesting label", async () => {
    await harness.mount();
    const label = [...harness.host.querySelectorAll("*")].find(
      (node) => node.children.length === 0 && node.textContent === "Harvesting",
    );
    if (!label) throw new Error("Missing Harvesting label");
    await rightClick(label);
    expect(hasMenuItem("Sections")).toBe(true);
  });

  it("leaves row and section header menus in charge", async () => {
    await harness.mount();
    await rightClick(harness.button("Uncategorized"));
    expect(hasMenuItem("Visibility")).toBe(true);
    expect(hasMenuItem("Sections")).toBe(false);
  });

  it("opens Customize Sidebar", async () => {
    await savePrefsSection("sidebar", {
      destinations: { ...PrefsSchema.parse({}).sidebar.destinations },
    });
    await harness.mount();
    const scroll = harness.host.querySelector('[data-scroll-fade="vertical"]');
    if (!scroll) throw new Error("Missing sidebar scroll");
    await rightClick(scroll);
    await act(async () => harness.menuItem("Customize Sidebar").click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("leaves the text menu to fields in dialogs opened from the sidebar", async () => {
    await harness.mount();
    const scroll = harness.host.querySelector('[data-scroll-fade="vertical"]');
    if (!scroll) throw new Error("Missing sidebar scroll");
    await rightClick(scroll);
    await act(async () => harness.menuItem("New Smart Folder").click());
    const field = document.querySelector('[role="dialog"] input');
    if (!field) throw new Error("Missing Smart Folder editor field");
    expect(harness.host.contains(field)).toBe(false);

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    await act(async () => {
      field.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(hasMenuItem("Sections")).toBe(false);
  });
});
