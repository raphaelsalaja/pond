import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cancelPreload,
  heldImageUrls,
  PRELOAD_SETTLE_MS,
} from "@/features/saves/lib/media/preload";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { ViewerPreload } from "./viewer-preload";

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
        sha256: "",
        size: 1,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  /** jsdom never decodes, so every preload stays in flight until cancelled. */
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => new Promise<void>(() => {}),
  });
  for (const id of ["first", "second", "third"]) pool.upsert(imageSave(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  for (const url of heldImageUrls()) cancelPreload(url);
  selection.setCursor(null);
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  host.remove();
  vi.useRealTimers();
});

const moveTo = (id: string) => act(async () => selection.setCursor(id));
const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

it("prepares only the Save you stop on during a sweep", async () => {
  await act(async () => root.render(<ViewerPreload details />));
  await moveTo("first");
  await wait(PRELOAD_SETTLE_MS / 2);
  await moveTo("second");
  await wait(PRELOAD_SETTLE_MS / 2);
  await moveTo("third");
  expect(heldImageUrls()).toEqual([]);

  await wait(PRELOAD_SETTLE_MS);

  expect(heldImageUrls()).toEqual(["pond://third/third.jpg"]);
});

it("stops preparing a Save once you move past it", async () => {
  await act(async () => root.render(<ViewerPreload details />));
  await moveTo("first");
  await wait(PRELOAD_SETTLE_MS);
  expect(heldImageUrls()).toEqual(["pond://first/first.jpg"]);

  await moveTo("second");

  expect(heldImageUrls()).not.toContain("pond://first/first.jpg");
  await wait(PRELOAD_SETTLE_MS);
  expect(heldImageUrls()).toEqual(["pond://second/second.jpg"]);
});
