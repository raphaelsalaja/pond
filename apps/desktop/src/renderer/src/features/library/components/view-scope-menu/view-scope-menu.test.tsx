import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { searchViewKey } from "@/features/library/lib/search-view";
import {
  getViewState,
  resetFilters,
} from "@/features/library/state/view-store";
import { ViewScopeMenu } from ".";

const design = { kind: "folder", id: "design" } as const;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

function item(label: string): HTMLElement {
  const match = [
    ...document.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
  ].find((node) => node.textContent?.trim() === label);
  if (!match) throw new Error(`Missing menu item: ${label}`);
  return match;
}

it("switches a folder search to All Saves and back in place", async () => {
  await act(async () =>
    root.render(<ViewScopeMenu view={design} name="Design" scope="current" />),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Search Scope: Design"]',
  );
  expect(trigger?.textContent).toBe("Design");

  await act(async () => trigger?.click());
  await act(async () => item("All Saves").click());
  expect(getViewState().searchAllView).toBe(searchViewKey(design));

  await act(async () =>
    root.render(<ViewScopeMenu view={design} name="Design" scope="all" />),
  );
  expect(
    host.querySelector('button[aria-label="Search Scope: All Saves"]'),
  ).not.toBeNull();

  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Search Scope: All Saves"]',
      )
      ?.click(),
  );
  await act(async () => item("Design").click());
  expect(getViewState().searchAllView).toBeNull();
});
