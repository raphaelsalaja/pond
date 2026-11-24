import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save, SaveFile } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import { MediaViewer } from ".";

const COMPATIBLE_PREVIEW = "pond://_video_cache/compatible-video.mp4";

function image(path: string): SaveFile {
  return {
    path,
    kind: "image",
    mimeType: "image/jpeg",
    sha256: path,
    size: 1,
    width: 800,
    height: 600,
  };
}

function imageSave(id: string, files: Array<SaveFile>): Save {
  return {
    id,
    source: "local",
    sourceId: id,
    url: `https://example.test/${id}`,
    title: "Preview failure fixture",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files,
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

type Frame = { sources: Array<string>; fallback: boolean };

let host: HTMLDivElement;
let root: Root;
let frames: Array<Frame>;
let observer: MutationObserver;
let previews: Array<string>;
let compatiblePreview: boolean;

beforeEach(() => {
  previews = [];
  compatiblePreview = true;
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "saves.mediaTiming": () => ({ frameRate: null }),
      "video.preparePreview": ({ src }) => {
        previews.push(src);
        return compatiblePreview
          ? { ok: true, url: COMPATIBLE_PREVIEW }
          : { ok: false, error: "No compatible preview" };
      },
    },
    tx: async () => {},
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  frames = [];
  observer = new MutationObserver(() => {
    frames.push({
      sources: [...host.querySelectorAll("img, video")].map(
        (node) => node.getAttribute("src") ?? "",
      ),
      fallback: host.querySelector("[data-viewer-fallback]") !== null,
    });
  });
  observer.observe(host, {
    subtree: true,
    childList: true,
    attributeFilter: ["src"],
  });
});

afterEach(async () => {
  observer.disconnect();
  await act(async () => root.unmount());
  host.remove();
  resultNavigation.setSource({ ids: [] });
});

/** Chromium can't load `pond://`, so every original and generated preview fails for real. */
async function waitForFallback(within: ParentNode = host): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    expect(within.querySelector("[data-viewer-fallback]")).not.toBeNull();
  });
}

it("keeps a failed only slide visible through generated and file fallback", async () => {
  const save = imageSave("single-failure", [image("reference.jpg")]);
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));
  await waitForFallback();

  expect(frames).toContainEqual({
    sources: expect.arrayContaining([expect.stringContaining("preview=2048")]),
    fallback: false,
  });
  expect(host.textContent).toContain("This preview could not be rendered.");
  expect(
    host.querySelector('button[aria-label="Open in Default App"]'),
  ).not.toBeNull();
  expect(host.querySelectorAll("[data-blossom-slide]")).toHaveLength(1);
  expect(
    host.querySelector("[data-blossom-slide]")?.getAttribute("data-file-index"),
  ).toBe("0");

  frames.length = 0;
  const replaced = imageSave(save.id, [image("replacement.jpg")]);
  pool.upsert(replaced);
  await act(async () => root.render(<MediaViewer save={replaced} />));

  expect(frames).toContainEqual({
    sources: expect.arrayContaining([
      expect.stringMatching(/replacement\.jpg(?!.*preview=)/),
    ]),
    fallback: false,
  });
});

it("does not change slide count or file indices when an item fails", async () => {
  const save = imageSave("multi-failure", [
    image("first.jpg"),
    image("second.jpg"),
    image("third.jpg"),
  ]);
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));
  const second = host.querySelectorAll("[data-blossom-slide]")[1];
  if (!second) {
    throw new Error("Missing second slide");
  }
  await waitForFallback(second);

  const slides = [...host.querySelectorAll("[data-blossom-slide]")];
  expect(slides).toHaveLength(3);
  expect(slides.map((slide) => slide.getAttribute("data-file-index"))).toEqual([
    "0",
    "1",
    "2",
  ]);
  expect(slides[1]?.querySelector("[data-viewer-fallback]")).not.toBeNull();
  expect(slides[0]?.getAttribute("data-active")).toBe("true");
});

it("keeps a failed video in place as a file fallback", async () => {
  compatiblePreview = false;
  const save = imageSave("video-failure", [
    {
      path: "movie.mp4",
      kind: "video",
      mimeType: "video/mp4",
      sha256: "movie",
      size: 1,
      width: 1280,
      height: 720,
    },
  ]);
  save.mediaType = "video";
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));
  await waitForFallback();

  expect(host.textContent).toContain("This preview could not be rendered.");
  expect(host.querySelectorAll("[data-blossom-slide]")).toHaveLength(1);
  expect(
    host.querySelector('button[aria-label="Open in Default App"]'),
  ).not.toBeNull();
});

it("retries an undecodable video through one compatible preview before fallback", async () => {
  const save = imageSave("video-proxy", [
    {
      path: "legacy.avi",
      kind: "video",
      mimeType: "video/x-msvideo",
      sha256: "legacy-video",
      size: 1,
      width: 1280,
      height: 720,
    },
  ]);
  save.mediaType = "video";
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));
  await waitForFallback();

  expect(previews).toEqual([expect.stringContaining("legacy.avi")]);
  expect(frames).toContainEqual({
    sources: expect.arrayContaining([COMPATIBLE_PREVIEW]),
    fallback: false,
  });
});
