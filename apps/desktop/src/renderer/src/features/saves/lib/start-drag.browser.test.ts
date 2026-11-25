import type { OkResult } from "@shared/query-contracts-shared";
import { afterEach, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import { bridge } from "@/shared/test/pond-bridge";
import { normalise, SavePatchSchema } from "./reconcile";
import {
  beginSaveDrag,
  clearDraggingSaveIds,
  draggingSaveIds,
  endSaveDrag,
  isLibrarySaveDrag,
  SAVE_DRAG_TYPE,
  saveDropIds,
} from "./start-drag";
import type { SaveDragDataTransfer } from "./start-drag";

afterEach(() => {
  selection.clear();
  clearDraggingSaveIds();
  pool.clear();
});

function startDragReplies(result: OkResult) {
  bridge.use({ query: { "saves.startDrag": () => result } });
}

interface TestSaveDragDataTransfer extends SaveDragDataTransfer {
  readonly dragImage: Element | null;
}

function start(
  dataTransfer: SaveDragDataTransfer | null = null,
  altKey = false,
) {
  return { dataTransfer, preventDefault: vi.fn(), altKey };
}

function seedImage(id: string) {
  const save = normalise(
    SavePatchSchema.parse({
      id,
      source: "local",
      files: [
        {
          kind: "original",
          path: `${id}.jpg`,
          sha256: "0123456789abcdef",
          size: 1,
          mimeType: "image/jpeg",
        },
      ],
    }),
  );
  if (!save) {
    throw new Error("Invalid image fixture");
  }
  pool.upsert(save);
}

function transfer(
  types: Array<string> = [],
  data: Record<string, string> = {},
): TestSaveDragDataTransfer {
  let dragImage: Element | null = null;
  return {
    types,
    effectAllowed: "none",
    get dragImage() {
      return dragImage;
    },
    setData(type: string, value: string) {
      data[type] = value;
      if (!types.includes(type)) {
        types.push(type);
      }
    },
    getData(type: string) {
      return data[type] ?? "";
    },
    setDragImage(image: Element) {
      dragImage = image;
    },
  };
}

it("marks an in-app Save drag from MIME or the live drag ids", () => {
  const data = transfer();
  expect(isLibrarySaveDrag(data)).toBe(false);
  beginSaveDrag("film", start(data));
  expect(data.getData(SAVE_DRAG_TYPE)).toBe("film");
  expect(isLibrarySaveDrag(data)).toBe(true);
  expect(saveDropIds(data)).toEqual(["film"]);
  expect(draggingSaveIds()).toEqual(["film"]);
});

it("reads Save ids from the MIME even after the live drag list is replaced", () => {
  const data = transfer([SAVE_DRAG_TYPE], { [SAVE_DRAG_TYPE]: "a,b" });
  expect(saveDropIds(data)).toEqual(["a", "b"]);
});

it("creates a counted drag proxy and clears the entire drag session", () => {
  selection.set(["a", "b", "c"]);
  for (const id of selection.snapshot()) {
    const card = document.createElement("li");
    card.dataset.saveId = id;
    const image = document.createElement("img");
    image.src = `https://example.com/${id}.png`;
    card.append(image);
    document.body.append(card);
  }
  const data = transfer();

  beginSaveDrag("a", start(data));

  expect(data.dragImage).toBeInstanceOf(HTMLElement);
  expect(data.dragImage?.textContent).toContain("3 Saves");
  expect(document.body.dataset.saveDragging).toBe("3");
  expect(document.querySelector("[data-save-drag-preview]")).not.toBeNull();

  endSaveDrag();

  expect(draggingSaveIds()).toEqual([]);
  expect(document.body.dataset.saveDragging).toBeUndefined();
  expect(document.querySelector("[data-save-drag-preview]")).toBeNull();
  for (const node of document.querySelectorAll("[data-save-id]")) {
    node.remove();
  }
});

it("clears the drag session when the browser dispatches dragend", () => {
  selection.set(["a", "b"]);
  beginSaveDrag("a", start(transfer()));

  window.dispatchEvent(new Event("dragend"));

  expect(draggingSaveIds()).toEqual([]);
  expect(document.body.dataset.saveDragging).toBeUndefined();
});

it("hands saves with files to a native drag and cancels the browser drag", () => {
  startDragReplies({ ok: true });
  seedImage("photo");
  const data = transfer();
  const event = start(data, true);

  beginSaveDrag("photo", event);

  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(window.pond.query).toHaveBeenCalledWith("saves.startDrag", {
    ids: ["photo"],
    fileIndex: 0,
    fileIndexes: { photo: 0 },
  });
  expect(data.getData(SAVE_DRAG_TYPE)).toBe("");
  expect(isLibrarySaveDrag(transfer(["Files"]))).toBe(true);
  expect(saveDropIds(transfer(["Files"]))).toEqual(["photo"]);
});

it("sends each save's own file index in a native drag", () => {
  startDragReplies({ ok: true });
  seedImage("one");
  seedImage("two");
  selection.set(["one", "two"]);

  beginSaveDrag("one", start(transfer(), true));

  expect(window.pond.query).toHaveBeenCalledWith("saves.startDrag", {
    ids: ["one", "two"],
    fileIndex: 0,
    fileIndexes: { one: 0, two: 0 },
  });
});

it("ignores a released pointer until the native drag has crossed the window", () => {
  startDragReplies({ ok: true });
  seedImage("photo");
  beginSaveDrag("photo", start(transfer(), true));

  window.dispatchEvent(new PointerEvent("pointermove", { buttons: 0 }));
  expect(draggingSaveIds()).toEqual(["photo"]);

  window.dispatchEvent(new Event("dragover"));
  window.dispatchEvent(new PointerEvent("pointermove", { buttons: 0 }));
  expect(draggingSaveIds()).toEqual([]);
  expect(document.body.dataset.saveDragging).toBeUndefined();
});

it("ends a native drag on the next click or Escape", () => {
  startDragReplies({ ok: true });
  seedImage("photo");
  beginSaveDrag("photo", start(transfer(), true));
  window.dispatchEvent(new PointerEvent("pointerdown"));
  expect(draggingSaveIds()).toEqual([]);

  beginSaveDrag("photo", start(transfer(), true));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(draggingSaveIds()).toEqual([]);
});

function hasTitle(detail: unknown): detail is { title: string } {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "title" in detail &&
    typeof detail.title === "string"
  );
}

it("ends the drag and explains why when Pond can't start it", async () => {
  startDragReplies({ ok: false, error: "No preview" });
  const titles: Array<string> = [];
  const onNotification = (event: Event) => {
    if ("detail" in event && hasTitle(event.detail)) {
      titles.push(event.detail.title);
    }
  };
  window.addEventListener("pond:notification", onNotification);
  seedImage("photo");
  beginSaveDrag("photo", start(transfer(), true));

  await vi.waitFor(() => expect(draggingSaveIds()).toEqual([]));
  window.removeEventListener("pond:notification", onNotification);
  expect(titles).toContain("Couldn't start the drag");
});

it("drags a file-backed save as an in-app payload by default, not a native drag", () => {
  startDragReplies({ ok: true });
  seedImage("photo");
  const data = transfer();

  beginSaveDrag("photo", start(data));

  expect(window.pond.query).not.toHaveBeenCalled();
  expect(data.getData(SAVE_DRAG_TYPE)).toBe("photo");
  expect(isLibrarySaveDrag(data)).toBe(true);
  expect(saveDropIds(data)).toEqual(["photo"]);
  expect(draggingSaveIds()).toEqual(["photo"]);
});
