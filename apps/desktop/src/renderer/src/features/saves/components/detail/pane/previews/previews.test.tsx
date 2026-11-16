import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { SavePreviews } from ".";

function imageSave(id: string, size?: { width: number; height: number }): Save {
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
        ...size,
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

  it("holds the shown preview for the newest Save while you step past others", async () => {
    await show(imageSave("first"));
    await decode("first");
    await show(imageSave("second"));
    await show(imageSave("third"));
    expect(layers()).toEqual(["shown first", "pending third"]);

    await decode("second");
    expect(layers()).toEqual(["shown first", "pending third"]);

    await decode("third");
    expect(layers()).toEqual(["shown third"]);
  });

  it("reserves the preview's shape before its image loads", async () => {
    await show(imageSave("wide", { width: 1600, height: 900 }));
    const image = host.querySelector<HTMLImageElement>('img[alt="wide"]');
    if (!image) throw new Error("Missing preview image");
    expect(Number(image.style.getPropertyValue("--preview-aspect"))).toBe(
      1600 / 900,
    );

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 900 },
      naturalHeight: { configurable: true, value: 1600 },
    });
    await act(async () => image.dispatchEvent(new Event("load")));

    expect(Number(image.style.getPropertyValue("--preview-aspect"))).toBe(
      900 / 1600,
    );
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
