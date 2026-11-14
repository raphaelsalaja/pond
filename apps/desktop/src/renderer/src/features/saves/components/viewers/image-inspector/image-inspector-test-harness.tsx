import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { ImageInspector } from "./";

export const IMAGE_INSPECTOR_SAVE: Save = {
  id: "image-inspector-test",
  source: "web",
  sourceId: "test",
  url: "https://example.test",
  title: "Reference",
  description: null,
  author: null,
  notes: null,
  mediaUrl: null,
  mediaType: "image",
  files: [],
  tags: [],
  savedAt: 0,
  createdAt: 0,
  deletedAt: null,
  rotate: 90,
  flipX: true,
  crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
};

export function setupImageInspectorTest() {
  let host: HTMLDivElement;
  let root: Root;
  const tx = vi.fn(async () => ({ ok: true }));

  beforeEach(() => {
    vi.stubGlobal("pond", {
      query: async () => PrefsSchema.parse({}),
      tx,
      appInfo: async () => ({ username: "Raphael Salaja" }),
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    pool.upsert(IMAGE_INSPECTOR_SAVE);
    tx.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const button = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent === label ||
        candidate.getAttribute("aria-label") === label,
    );
    if (!found) throw new Error(`Missing button ${label}`);
    return found;
  };
  const render = async (
    save: Save = IMAGE_INSPECTOR_SAVE,
    src = "pond://test/reference.jpg",
    fileIndex?: number,
  ) => {
    pool.upsert(save);
    await act(async () =>
      root.render(
        <ImageInspector
          save={save}
          fileIndex={fileIndex}
          src={src}
          active
          onRatio={() => {}}
          onError={() => {}}
        />,
      ),
    );
  };
  const prepareFrame = (): Element => {
    const frame = host.querySelector("[data-background]");
    if (!frame) throw new Error("Missing image inspection frame");
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 400, 400),
    );
    Object.defineProperties(frame, {
      setPointerCapture: { value: () => {} },
      hasPointerCapture: { value: () => false },
    });
    return frame;
  };
  const flushPose = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
  };

  return {
    button,
    flushPose,
    get host() {
      return host;
    },
    prepareFrame,
    render,
    tx,
  };
}
