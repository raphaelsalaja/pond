import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { SavePreviews } from ".";

function imageSave(id: string): Save {
  return {
    id,
    source: "local",
    sourceId: id,
    url: `pond:local/${id}`,
    title: id,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [
      {
        path: `${id}.jpg`,
        kind: "image",
        mimeType: "image/jpeg",
        sha256: `fixture-${id}`,
        size: 1,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("SavePreviews", () => {
  let host: HTMLDivElement;
  let root: Root;
  /** jsdom has no image decoding, so tests settle `decode()` explicitly. */
  let decodes: Array<{ src: string; resolve: () => void }> = [];

  beforeEach(() => {
    decodes = [];
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value(this: HTMLImageElement) {
        return new Promise<void>((resolve) => {
          decodes.push({ src: this.src, resolve });
        });
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
    host.remove();
  });

  const decode = (name: string) =>
    act(async () => {
      for (const pending of decodes) {
        if (pending.src.includes(`/${name}.jpg`)) pending.resolve();
      }
    });
  const layers = () =>
    [...host.querySelectorAll("img")].map((image) => {
      const pending = image.closest("[data-pending]") ? "pending" : "shown";
      return `${pending} ${image.alt}`;
    });
  const show = (save: Save) =>
    act(async () => root.render(<SavePreviews saves={[save]} />));

  it("keeps the previous preview until the next one decodes", async () => {
    await show(imageSave("first"));
    await decode("first");
    expect(layers()).toEqual(["shown first"]);

    await show(imageSave("second"));
    expect(layers()).toEqual(["shown first", "pending second"]);
    const held = host.querySelector('[aria-hidden="true"] img');
    expect(held?.getAttribute("alt")).toBe("first");

    await decode("second");
    expect(layers()).toEqual(["shown second"]);
  });

  it("swaps at once when the next preview fails to load", async () => {
    await show(imageSave("first"));
    await decode("first");
    await show(imageSave("broken"));

    const broken = host.querySelector<HTMLImageElement>('img[alt="broken"]');
    await act(async () => broken?.dispatchEvent(new Event("error")));

    expect(layers()).toEqual([]);
    expect(host.textContent).toContain("broken");
    expect(host.querySelector("[data-pending]")).toBeNull();
  });
});
