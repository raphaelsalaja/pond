import { isHTMLElement } from "@pond/ui/dom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import type { CombineImage } from "../preview";
import { Strip } from "./";

function image(id: string): CombineImage {
  const save = normalise(
    SavePatchSchema.parse({
      id,
      source: "local",
      sourceId: id,
      url: `pond:local/${id}`,
      title: id,
      description: null,
      mediaType: "image",
      files: [
        {
          kind: "image",
          path: `${id}.png`,
          sha256: id,
          size: 1,
          width: 10,
          height: 10,
        },
      ],
      tags: [],
    }),
  );
  const file = save?.files?.[0];
  if (!save || !file) {
    throw new Error("Fixture must produce an image save");
  }
  return { save, file };
}

function Harness() {
  const [images, setImages] = useState(() => ["a", "b", "c"].map(image));
  return (
    <Strip
      images={images}
      onReorder={(from, to) =>
        setImages((current) => {
          const next = [...current];
          const [moved] = next.splice(from, 1);
          if (moved) {
            next.splice(to, 0, moved);
          }
          return next;
        })
      }
      onRemove={() => undefined}
    />
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function order() {
  return [...host.querySelectorAll("li")].map((item) => item.title);
}

function press(key: string) {
  const target = document.activeElement;
  if (!isHTMLElement(target)) {
    throw new Error("Nothing focused");
  }
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

it("moves the focused image with Option and the arrow keys", async () => {
  await act(async () => root.render(<Harness />));
  const second = host.querySelectorAll<HTMLElement>('[role="button"]')[1];
  if (!second) {
    throw new Error("Missing image");
  }
  await act(async () => second.focus());
  await act(async () => press("ArrowUp"));
  expect(order()).toEqual(["b", "a", "c"]);
  expect(document.activeElement?.closest("li")?.title).toBe("b");
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Moved b to position 1 of 3.",
  );
  await act(async () => press("ArrowUp"));
  expect(order()).toEqual(["b", "a", "c"]);
  await act(async () => press("ArrowDown"));
  await act(async () => press("ArrowDown"));
  expect(order()).toEqual(["a", "c", "b"]);
});
