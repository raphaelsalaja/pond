import "@/app/effects/save-library-bridge";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { SaveCollectionContextMenu, SaveContextMenu } from ".";

let host: HTMLDivElement;
let root: Root;
let save: Save;

beforeEach(() => {
  vi.stubGlobal("pond", { query: async () => [] });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  pool.clear();
  selection.clear();
  const fixture = normalise(
    SavePatchSchema.parse({ id: "a", title: "Screenshot", source: "local" }),
  );
  if (!fixture) throw new Error("Invalid Save fixture");
  save = fixture;
  pool.upsert(save);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  pool.clear();
  selection.clear();
  vi.unstubAllGlobals();
});

function card() {
  return (
    <SaveContextMenu save={save}>
      <div data-library-card="" data-save-id="a">
        Card
      </div>
    </SaveContextMenu>
  );
}

async function renderHosted() {
  await act(async () =>
    root.render(
      <SaveCollectionContextMenu
        acceptsBackground={(target) =>
          target instanceof Element && target.closest("[data-bg]") != null
        }
        buildBackgroundItems={() => [{ label: "Paste Here" }]}
      >
        <div>
          <div data-bg="">Background</div>
          <div data-other="">Other</div>
          {card()}
        </div>
      </SaveCollectionContextMenu>,
    ),
  );
}

async function rightClick(selector: string) {
  const element = host.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 10,
        clientY: 10,
      }),
    );
  });
}

function searchLabel() {
  return document
    .querySelector('[role="searchbox"]')
    ?.getAttribute("aria-label");
}

it("opens the Save menu for a card inside a collection and selects it", async () => {
  await renderHosted();
  await rightClick("[data-save-id]");
  expect(searchLabel()).toBe("Search save operations");
  expect(selection.has("a")).toBe(true);
});

it("opens the background menu outside every card", async () => {
  await renderHosted();
  await rightClick("[data-bg]");
  expect(searchLabel()).toBe("Search operations");
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    ),
  ).toContain("Paste Here");
});

it("opens nothing for a target the collection does not accept", async () => {
  await renderHosted();
  await rightClick("[data-other]");
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("leaves the card without its own menu trigger inside a collection", async () => {
  await renderHosted();
  await rightClick("[data-save-id]");
  expect(
    host.querySelector("[data-save-id]")?.hasAttribute("data-popup-open"),
  ).toBe(false);
  expect(host.firstElementChild?.hasAttribute("data-popup-open")).toBe(true);
});

it("keeps its own menu for a card outside any collection", async () => {
  await act(async () => root.render(card()));
  await rightClick("[data-save-id]");
  expect(searchLabel()).toBe("Search save operations");
  expect(
    host.querySelector("[data-save-id]")?.hasAttribute("data-popup-open"),
  ).toBe(true);
});
