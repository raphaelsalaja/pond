import { PrefsSchema } from "@pond/schema";
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandMenu } from "@/features/library/state/command-menu";
import { clearRecents, normalise, useTrackVisit } from "@/features/saves";
import { selection } from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import type { SaveHit, SaveLookup } from "@/features/search";
import { CommandMenuHost } from "./";

const openSave = vi.fn();

function RecentVisit({ saveId }: { saveId: string }) {
  useTrackVisit(saveId);
  return null;
}

function addSave(id: string, title: string) {
  const save = normalise({
    id,
    source: "local",
    title,
    url: `pond://${id}`,
    author: "Pond",
    mediaType: "text",
  });
  if (!save) throw new Error("Invalid save fixture");
  pool.upsert(save);
  return save;
}

const lookups = {
  hits: new Map<string, readonly SaveHit[]>(),
  pending: new Set<string>(),
  version: 0,
  listeners: new Set<() => void>(),
};

function publish(): void {
  lookups.version += 1;
  for (const listener of lookups.listeners) listener();
}

function resolveLookup(query: string, hits: readonly SaveHit[]): void {
  lookups.pending.delete(query);
  lookups.hits.set(query, hits);
  publish();
}

function useLookup(query: string): SaveLookup {
  useSyncExternalStore(
    (listener) => {
      lookups.listeners.add(listener);
      return () => lookups.listeners.delete(listener);
    },
    () => lookups.version,
  );
  if (!query) return { query, hits: [], searching: false };
  return {
    query,
    hits: lookups.hits.get(query) ?? [],
    searching: lookups.pending.has(query),
  };
}

function input(): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    '[role="dialog"] input[role="combobox"]',
  );
  if (!element) throw new Error("Missing command input");
  return element;
}

function active(): string | null {
  return input().getAttribute("aria-activedescendant");
}

function optionIds(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map((el) => el.id);
}

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}

async function pressUntil(id: string) {
  for (let step = 0; step < 40 && active() !== id; step++) {
    await press("ArrowDown");
  }
  expect(active()).toBe(id);
}

function resultsHeight(): number {
  const results = document.querySelector<HTMLElement>("[data-sized]");
  return Number.parseFloat(
    results?.style.getPropertyValue("--results-height") ?? "",
  );
}

describe("command menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("pond", { query: async () => PrefsSchema.parse({}) });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    Element.prototype.scrollIntoView = vi.fn();
    openSave.mockClear();
    clearRecents();
    commandMenu.close();
    selection.clear();
    lookups.hits.clear();
    lookups.pending.clear();
    addSave("save-1", "Design systems field notes");
    lookups.hits.set("design", [{ id: "save-1", via: "keyword" }]);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    commandMenu.close();
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function open() {
    await act(async () =>
      root.render(
        <CommandMenuHost useLookup={useLookup} onOpenSave={openSave} />,
      ),
    );
    await act(async () => commandMenu.open());
    return input();
  }

  it("opens with navigation and actions", async () => {
    const field = await open();
    expect(document.activeElement).toBe(field);
    expect(document.body.textContent).toContain("Create");
    expect(document.body.textContent).toContain("Import Files");
    expect(document.body.textContent).toContain("Navigate");
    expect(document.body.textContent).toContain("Library");
    expect(document.body.textContent).toContain("Open Settings");
  });

  it("shows recent saves before commands and opens one", async () => {
    const save = addSave("recent-save", "Recently viewed poster");
    await act(async () => root.render(<RecentVisit saveId={save.id} />));

    await open();
    expect(document.body.textContent).toContain("Recent");
    expect(document.body.textContent).toContain("Recently viewed poster");
    expect(active()).toBe("recent:recent-save");
    await press("Enter");
    expect(openSave).toHaveBeenCalledWith("recent-save");
  });

  it("prioritizes actions for the current selection", async () => {
    selection.set(["save-1"]);
    await open();

    expect(document.body.textContent).toContain("1 Selected");
    expect(document.body.textContent).toContain("Add to Chat");
    expect(document.body.textContent).toContain("Export Selection");
    expect(document.body.textContent).toContain("Move to Trash");
  });

  it("searches saves and opens the highlighted result with the keyboard", async () => {
    await open();
    await type("design");
    expect(document.body.textContent).toContain("Design systems field notes");
    await pressUntil("save:save-1");
    await press("Enter");
    expect(openSave).toHaveBeenCalledWith("save-1");
    expect(document.querySelector('[role="dialog"][data-open]')).toBeNull();
  });

  it("ranks an exact save title above commands", async () => {
    addSave("save-settings", "Settings");
    lookups.hits.set("settings", [{ id: "save-settings", via: "keyword" }]);
    await open();
    await type("settings");

    const ids = optionIds();
    expect(ids[0]).toBe("save:save-settings");
    expect(ids).toContain("command:settings");
    expect(ids.at(-1)).toBe("search:library");
  });

  it("keeps commands and saves on one query clock", async () => {
    lookups.pending.add("notes");
    await open();
    await type("design");
    expect(optionIds()).toContain("save:save-1");

    await type("notes");
    expect(optionIds()).not.toContain("save:save-1");
    expect(document.body.textContent).toContain("Searching");

    await press("ArrowDown");
    const held = active();
    await act(async () =>
      resolveLookup("notes", [{ id: "save-1", via: "semantic" }]),
    );
    expect(optionIds()).toContain("save:save-1");
    expect(document.body.textContent).not.toContain("Searching");
    expect(active()).toBe(held);
  });

  it("only moves the active row once the pointer travels", async () => {
    await open();
    const first = active();
    const target = document.querySelectorAll<HTMLElement>('[role="option"]')[2];
    if (!target) throw new Error("Missing option");
    const move = (clientX: number, movementX: number) =>
      act(async () => {
        target.dispatchEvent(
          new MouseEvent("mousemove", { bubbles: true, clientX, movementX }),
        );
      });

    await move(100, 0);
    await move(102, 2);
    await move(104, 2);
    expect(active()).toBe(first);

    await move(108, 4);
    expect(active()).toBe(target.id);
  });

  it("opens save actions and steps back to the search", async () => {
    await open();
    await type("design");
    await pressUntil("save:save-1");

    await press("Tab");
    expect(input().value).toBe("");
    expect(document.body.textContent).toContain("Add to Chat");
    expect(document.body.textContent).toContain("Move to Trash");
    expect(optionIds()).not.toContain("save:save-1");

    await press("Backspace");
    expect(input().value).toBe("design");
    expect(active()).toBe("save:save-1");

    await press("Tab");
    await press("Escape");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input().value).toBe("design");
  });

  it("keeps composed text and dead keys from executing a command", async () => {
    await open();
    const initial = active();
    await press("ArrowDown", { isComposing: true });
    await press("Enter", { isComposing: true });
    await press("Enter", { keyCode: 229 });
    await press("Dead");
    expect(active()).toBe(initial);
    expect(openSave).not.toHaveBeenCalled();
  });

  it("resets the query and selection after an external close", async () => {
    await open();
    await type("design");
    await press("ArrowDown");
    await act(async () => commandMenu.toggle());
    await act(async () => commandMenu.open());

    expect(input().value).toBe("");
    expect(active()).toBe("command:new-folder");
  });

  it("sizes results from row heights and only grows while typing", async () => {
    await open();
    const resting = resultsHeight();
    expect(resting).toBeGreaterThan(0);
    expect(resting).toBeLessThanOrEqual(370);
    expect(document.querySelector("[data-sized]")).not.toBeNull();

    await type("zzzzqq");
    expect(document.body.textContent).toContain("No results found");
    expect(resultsHeight()).toBe(resting);
  });

  it("shows a save's title and author on one row", async () => {
    await open();
    await type("design");
    const save = document.getElementById("save:save-1");
    expect(save?.textContent).toContain("Design systems field notes");
    expect(save?.textContent).toContain("Pond");
    expect(save?.textContent).not.toContain("·");
  });

  it("dims the active row while the input is unfocused", async () => {
    const field = await open();
    const list = document.getElementById("pond-command-menu-results");
    expect(list?.hasAttribute("data-inactive")).toBe(false);
    await act(async () => field.blur());
    expect(list?.hasAttribute("data-inactive")).toBe(true);
  });
});
