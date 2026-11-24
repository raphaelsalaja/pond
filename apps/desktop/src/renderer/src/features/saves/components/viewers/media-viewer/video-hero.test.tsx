import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save } from "@/features/saves/types";
import { MediaViewer } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    query: async () => PrefsSchema.parse({}),
    tx: async () => ({ ok: true }),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  resultNavigation.setSource({ ids: [] });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("fits a video without recorded dimensions to its poster", async () => {
  const save: Save = {
    id: "portrait-video",
    source: "local",
    sourceId: "portrait-video",
    url: "https://example.test/portrait-video",
    title: "Portrait video",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "video",
    files: [
      {
        path: "clip.mp4",
        kind: "video",
        mimeType: "video/mp4",
        sha256: "clip",
        size: 1,
      },
      {
        path: "poster.jpg",
        kind: "poster",
        mimeType: "image/jpeg",
        sha256: "poster",
        size: 1,
        width: 1080,
        height: 1920,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));

  const frame = host.querySelector("video")?.parentElement;
  expect(frame?.style.width).toBe("450px");
  expect(frame?.style.height).toBe("800px");
});
