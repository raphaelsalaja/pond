import type { Predicate } from "@pond/schema/filters/types";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addLocalDays,
  endOfLocalDay,
  formatLocalDay,
  startOfLocalDay,
} from "@/features/library/lib/local-day";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import { getViewState, setQuery } from "@/features/library/state/view-store";
import { topLevelMenuLabels as labels } from "@/shared/test/menu-labels";
import {
  buildRecentlyAddedMenuItems,
  recentlyAddedDays,
} from "./recently-added-menu";
import { createFolderSidebarHarness, sidebarCounts } from "./test-harness";

/** The calendar popover can take seconds to open on loaded CI runners. */
const OPEN_TIMEOUT = 15_000;

const IMAGES: Predicate = { field: "type", operator: "eq", value: "image" };

describe("recently added menu", () => {
  const items = (hasItems: boolean) =>
    buildRecentlyAddedMenuItems({ hasItems, onChooseDate: () => {} });

  it("offers the date shortcuts", () => {
    expect(labels(items(true))).toEqual([
      "Added Today",
      "Added Yesterday",
      "Choose Date",
    ]);
  });

  it("disables the shortcuts when nothing was added recently", () => {
    expect(
      items(false).map((item) =>
        "disabled" in item ? item.disabled : undefined,
      ),
    ).toEqual([true, true, true]);
  });

  it.each([
    ["the afternoon", new Date(2026, 10, 19, 15)],
    ["just after midnight", new Date(2026, 10, 19, 0, 30)],
  ])("limits the picker to the rolling seven days in %s", (_, now) => {
    expect(recentlyAddedDays(now)).toEqual({
      min: "2026-11-12",
      max: "2026-11-19",
    });
  });
});

describe("recently added date shortcuts", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  async function openMenu() {
    sidebarCounts.current.recentlyAdded = 3;
    const router = await harness.mount();
    await vi.waitFor(() =>
      expect(harness.button("Recently Added").textContent).toContain("3"),
    );
    setQuery({ combinator: "and", rules: [IMAGES] });
    await act(async () => {
      harness.button("Recently Added").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    return router;
  }

  async function openCalendar(): Promise<HTMLElement> {
    await act(async () => harness.menuItem("Choose Date").click());
    return vi.waitFor(
      () => {
        const popup = document.querySelector<HTMLElement>(
          '[aria-label="Choose Date"]',
        );
        if (!popup?.querySelector("table"))
          throw new Error("Calendar did not open");
        return popup;
      },
      { timeout: OPEN_TIMEOUT },
    );
  }

  function day(popup: HTMLElement, date: Date): HTMLElement {
    const cell = popup.querySelector<HTMLElement>(
      `[data-day="${formatLocalDay(date)}"]`,
    );
    if (!cell) throw new Error(`Missing day ${formatLocalDay(date)}`);
    return cell;
  }

  it("opens Recently Added filtered to yesterday in place of other filters", async () => {
    const router = await openMenu();
    await act(async () => harness.menuItem("Added Yesterday").click());
    const yesterday = addLocalDays(new Date(), -1);
    expect(router.state.location.pathname).toBe("/recently-added");
    expect(getLibraryNav()).toEqual({ kind: "recentlyAdded" });
    expect(getViewState().rows).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: [startOfLocalDay(yesterday), endOfLocalDay(yesterday)],
      },
    ]);
  });

  it("opens Recently Added filtered to today", async () => {
    await openMenu();
    await act(async () => harness.menuItem("Added Today").click());
    expect(getViewState().rows).toEqual([
      { field: "savedAt", operator: "gte", value: startOfLocalDay(new Date()) },
    ]);
  });

  it("applies the chosen day and won't pick a day after today", async () => {
    const router = await openMenu();
    const popup = await openCalendar();
    const today = new Date();
    const tomorrow = day(popup, addLocalDays(today, 1));
    expect(tomorrow.getAttribute("aria-disabled")).toBe("true");
    await act(async () => day(popup, today).click());
    expect(router.state.location.pathname).toBe("/recently-added");
    expect(getViewState().rows).toEqual([
      { field: "savedAt", operator: "gte", value: startOfLocalDay(today) },
    ]);
  });

  it("leaves the view and filters alone when the calendar is dismissed", async () => {
    const router = await openMenu();
    await openCalendar();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Choose Date"]')).toBeNull(),
    );
    expect(router.state.location.pathname).toBe("/");
    expect(getLibraryNav()).toEqual({ kind: "all" });
    expect(getViewState().rows).toEqual([IMAGES]);
  });
});
