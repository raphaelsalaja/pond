import type { QueryInput } from "@shared/query-contracts";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { folders } from "@/features/library/state/folders";
import {
  beginSaveDrag,
  draggingSaveIds,
  SAVE_DRAG_TYPE,
} from "@/features/saves/lib/start-drag";
import { selection } from "@/features/saves/navigation";
import { toastManager } from "@/shared/lib/toast";
import { bridge } from "@/shared/test/pond-bridge";
import { FOLDER_NEST_DWELL_MS } from "./folder-drop";
import {
  createFolderSidebarHarness,
  fireDrag,
  folder,
  folderTransfer,
} from "./test-harness";

interface Point {
  x: number;
  y: number;
}

function pointer(type: string, point: Point): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  return event;
}

function toastText(): string {
  return document.body.querySelector("[data-slot='toasts']")?.textContent ?? "";
}

function folderRow(host: HTMLElement, id: string): HTMLElement {
  const row = host.querySelector<HTMLElement>(`[data-folder-sortable="${id}"]`);
  if (!row) {
    throw new Error(`Missing folder row: ${id}`);
  }
  return row;
}

function rootDrop(host: HTMLElement): HTMLElement {
  const drop = host.querySelector<HTMLElement>("[data-folder-root-drop]");
  if (!drop) {
    throw new Error("Missing top-level drop space");
  }
  return drop;
}

function at(element: HTMLElement, fraction: number): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + 20, y: rect.top + rect.height * fraction };
}

function recordMove(): Promise<QueryInput<"folders.move">> {
  const moved = Promise.withResolvers<QueryInput<"folders.move">>();
  bridge.use({
    query: {
      "folders.move": (input) => {
        moved.resolve(input);
        return { ok: true, undoId: null };
      },
    },
  });
  return moved.promise;
}

describe("folder sidebar drag and drop", () => {
  const harness = createFolderSidebarHarness();

  async function drag(label: string, start: Point, moves: Array<Point>) {
    await act(async () => {
      harness.button(label).dispatchEvent(pointer("pointerdown", start));
    });
    for (const point of moves) {
      await act(async () => {
        document.dispatchEvent(pointer("pointermove", point));
      });
    }
  }

  async function release(point: Point) {
    await act(async () => {
      document.dispatchEvent(pointer("pointerup", point));
    });
  }

  beforeEach(() => harness.setup());
  afterEach(async () => {
    vi.useRealTimers();
    toastManager.close();
    await harness.cleanup();
  });

  it("nests a folder once the pointer rests on a row's middle", async () => {
    harness.set({ folders: [folder("Travel"), folder("Shots")] });
    await folders.refresh();
    await harness.mount();
    const moved = recordMove();
    const travel = folderRow(harness.host, "Travel");
    const shots = folderRow(harness.host, "Shots");
    const target = at(travel, 0.5);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    await drag("Shots", at(shots, 0.5), [at(shots, 0.25), target]);
    expect(travel.hasAttribute("data-drop")).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(FOLDER_NEST_DWELL_MS + 20);
    });
    expect(travel.getAttribute("data-drop")).toBe("into");

    await release(target);
    vi.useRealTimers();
    expect(await moved).toEqual({ id: "Shots", parentId: "Travel" });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "folders.addSaves",
      expect.anything(),
    );
  });

  it("places a folder beside a row when released before nesting arms", async () => {
    harness.set({
      folders: [folder("Travel"), folder("Shots"), folder("Archive")],
    });
    await folders.refresh();
    await harness.mount();
    const moved = recordMove();
    const travel = folderRow(harness.host, "Travel");
    const archive = folderRow(harness.host, "Archive");
    const target = at(travel, 0.375);
    await drag("Archive", at(archive, 0.5), [at(archive, 0.25), target]);
    expect(travel.getAttribute("data-drop")).toBe("before");

    await release(target);
    expect(await moved).toEqual({
      id: "Archive",
      parentId: null,
      beforeId: "Travel",
    });
  });

  it("drops after an expanded folder as its first child", async () => {
    harness.set({
      folders: [folder("Travel"), folder("Tickets", "Travel"), folder("Shots")],
    });
    await folders.refresh();
    await harness.mount();
    const moved = recordMove();
    const tickets = folderRow(harness.host, "Tickets");
    const travel = folderRow(harness.host, "Travel");
    const shots = folderRow(harness.host, "Shots");
    const target = at(travel, 0.875);
    await drag("Shots", at(shots, 0.5), [at(shots, 0.25), target]);
    expect(tickets.getAttribute("data-drop")).toBe("before");
    expect(travel.hasAttribute("data-drop")).toBe(false);

    await release(target);
    expect(await moved).toEqual({
      id: "Shots",
      parentId: "Travel",
      beforeId: "Tickets",
    });
  });

  it("moves a nested folder to the end of the top level below the list", async () => {
    harness.set({ folders: [folder("Travel"), folder("Tickets", "Travel")] });
    await folders.refresh();
    await harness.mount();
    const moved = recordMove();
    const tickets = folderRow(harness.host, "Tickets");
    const drop = rootDrop(harness.host);
    const target = at(drop, 0.5);
    await drag("Tickets", at(tickets, 0.5), [at(tickets, 0.75), target]);
    expect(drop.hasAttribute("data-target")).toBe(true);

    await release(target);
    expect(await moved).toEqual({ id: "Tickets", parentId: null });
  });

  it("ignores legacy native folder payloads", async () => {
    harness.set({ folders: [folder("Travel"), folder("Tickets", "Travel")] });
    await folders.refresh();
    await harness.mount();
    const transfer = folderTransfer("Travel");
    await act(async () => {
      fireDrag(harness.button("Tickets"), "drop", transfer);
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "folders.move",
      expect.anything(),
    );
  });

  it("still files selected saves onto a folder", async () => {
    harness.set({ folders: [folder("Travel")] });
    await folders.refresh();
    selection.set(["save-1"]);
    const transfer = folderTransfer();
    transfer.setData(SAVE_DRAG_TYPE, "save-1");
    await harness.mount();
    await act(async () => {
      fireDrag(harness.button("Travel"), "drop", transfer);
    });
    expect(window.pond.query).toHaveBeenCalledWith("folders.addSaves", {
      folderId: "Travel",
      saveIds: ["save-1"],
    });
  });

  it("uses the immutable drag payload and shows the destination action", async () => {
    harness.set({ folders: [folder("Travel")] });
    await folders.refresh();
    const added = Promise.withResolvers<QueryInput<"folders.addSaves">>();
    bridge.use({
      query: {
        "folders.addSaves": (input) => {
          added.resolve(input);
          return { ok: true, undoId: null };
        },
      },
    });
    selection.set(["drag-a", "drag-b"]);
    const transfer = folderTransfer();
    beginSaveDrag("drag-a", { dataTransfer: transfer, preventDefault() {} });
    selection.set(["changed-after-start"]);
    await harness.mount();
    const target = harness.button("Travel");

    await act(async () => {
      fireDrag(target, "dragover", transfer);
    });
    expect(target.textContent).toContain("Add 2 Saves");
    expect(transfer.dropEffect).toBe("copy");

    await act(async () => {
      fireDrag(target, "drop", transfer);
    });
    expect(await added.promise).toEqual({
      folderId: "Travel",
      saveIds: ["drag-a", "drag-b"],
    });
    await vi.waitFor(() =>
      expect(toastText()).toContain('Added 2 Saves to "Travel"'),
    );
    expect(draggingSaveIds()).toEqual([]);
  });

  it("reports a failed Save assignment", async () => {
    harness.set({ folders: [folder("Travel")] });
    await folders.refresh();
    const transfer = folderTransfer();
    transfer.setData(SAVE_DRAG_TYPE, "save-1");
    await harness.mount();
    bridge.use({
      query: {
        "folders.addSaves": () => Promise.reject(new Error("Disk unavailable")),
      },
    });

    await act(async () => {
      fireDrag(harness.button("Travel"), "drop", transfer);
    });

    await vi.waitFor(() =>
      expect(toastText()).toContain("Couldn't add Save to folder"),
    );
    expect(toastText()).toContain("Try again.");
  });

  it("does not mistake a legacy folder payload for a Save drop", async () => {
    harness.set({ folders: [folder("Travel"), folder("Shots")] });
    await folders.refresh();
    selection.set(["save-1"]);
    await harness.mount();
    await act(async () => {
      fireDrag(harness.button("Travel"), "drop", folderTransfer("Shots"));
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "folders.move",
      expect.anything(),
    );
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "folders.addSaves",
      expect.anything(),
    );
  });
});
