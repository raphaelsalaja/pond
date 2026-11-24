import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach } from "vitest";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
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

async function flushPose() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function setupImageInspectorTest() {
  let host: HTMLDivElement;
  let root: Root;
  /** jsdom lays nothing out, so the frame reports this rect once a test prepares it. */
  let frameRect = new DOMRect();
  const measureFrame = () => frameRect;

  beforeEach(() => {
    bridge.use({
      query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
      tx: async () => {},
      appInfo: async () => ({
        name: "Pond",
        version: "0.0.0",
        platform: "linux",
        arch: "arm64",
        username: "Raphael Salaja",
        isPackaged: false,
      }),
    });
    frameRect = new DOMRect();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    pool.upsert(IMAGE_INSPECTOR_SAVE);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const button = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent === label ||
        candidate.getAttribute("aria-label") === label,
    );
    if (!found) {
      throw new Error(`Missing button ${label}`);
    }
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
          measureFrame={measureFrame}
        />,
      ),
    );
  };
  const prepareFrame = (): Element => {
    const frame = host.querySelector("[data-background]");
    if (!frame) {
      throw new Error("Missing image inspection frame");
    }
    frameRect = new DOMRect(0, 0, 400, 400);
    Object.defineProperties(frame, {
      setPointerCapture: { value: () => {} },
      hasPointerCapture: { value: () => false },
    });
    return frame;
  };
  return {
    button,
    flushPose,
    get host() {
      return host;
    },
    prepareFrame,
    render,
    get tx() {
      return window.pond.tx;
    },
  };
}
