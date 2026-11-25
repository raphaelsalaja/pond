import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatePicker, DatePopover } from ".";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function openPicker(props: {
  value: string;
  max?: string;
  onValueChange: (value: string) => void;
}) {
  await act(async () => {
    root.render(<DatePicker aria-label="Date" locale="en-GB" {...props} />);
  });
  const trigger = host.querySelector<HTMLElement>('[aria-label^="Date"]');
  await act(async () => trigger?.click());
  return vi.waitFor(() => {
    const grid = document.querySelector<HTMLElement>("table");
    if (!grid) {
      throw new Error("Calendar did not open");
    }
    return grid;
  });
}

function Anchored({
  onOpenChange,
  onValueChange,
}: {
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button">
        Recently Added
      </button>
      <DatePopover
        open
        anchor={anchor}
        min="2026-10-10"
        max="2026-10-17"
        locale="en-GB"
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
      />
    </>
  );
}

function day(value: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-day="${value}"]`);
  if (!found) {
    throw new Error(`Missing day ${value}`);
  }
  return found;
}

it("opens on the chosen month and picks a day", async () => {
  const onValueChange = vi.fn();
  await openPicker({ value: "2026-01-15", onValueChange });
  expect(document.querySelector("table")?.getAttribute("aria-label")).toBe(
    "January 2026",
  );
  expect(day("2026-01-15").getAttribute("aria-selected")).toBe("true");
  expect(day("2026-01-16").getAttribute("aria-selected")).toBe("false");
  await act(async () => day("2026-01-20").click());
  expect(onValueChange).toHaveBeenCalledWith("2026-01-20");
});

it("moves by day, week, and month from the keyboard", async () => {
  const grid = await openPicker({
    value: "2026-01-15",
    onValueChange: vi.fn(),
  });
  const press = async (key: string) => {
    const cell = grid.querySelector('[role="gridcell"][tabindex="0"]');
    await act(async () => {
      cell?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  };
  await press("ArrowRight");
  expect(document.activeElement).toBe(day("2026-01-16"));
  await press("ArrowDown");
  expect(document.activeElement).toBe(day("2026-01-23"));
  await press("PageDown");
  expect(document.activeElement).toBe(day("2026-02-23"));
});

it("won't pick a day after the latest allowed", async () => {
  await openPicker({
    value: "2026-10-10",
    max: "2026-10-17",
    onValueChange: vi.fn(),
  });
  expect(day("2026-10-17").getAttribute("aria-disabled")).toBeNull();
  expect(day("2026-10-18").getAttribute("aria-disabled")).toBe("true");
  expect(
    document.querySelector<HTMLButtonElement>('[aria-label="Next Month"]')
      ?.disabled,
  ).toBe(true);
});

it("opens beside its anchor and picks a day inside its range", async () => {
  const onValueChange = vi.fn();
  const onOpenChange = vi.fn();
  await act(async () =>
    root.render(
      <Anchored onOpenChange={onOpenChange} onValueChange={onValueChange} />,
    ),
  );
  await vi.waitFor(() => {
    if (!document.querySelector('[aria-label="Choose Date"] table')) {
      throw new Error("Calendar did not open");
    }
  });
  expect(day("2026-10-09").getAttribute("aria-disabled")).toBe("true");
  expect(day("2026-10-18").getAttribute("aria-disabled")).toBe("true");
  expect(day("2026-10-14").getAttribute("aria-disabled")).toBeNull();
  await act(async () => day("2026-10-14").click());
  expect(onValueChange).toHaveBeenCalledWith("2026-10-14");
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
