import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save, SaveFile } from "@/features/saves/types";
import { MediaViewer } from ".";

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

let host: HTMLDivElement;
let root: Root;
let query: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  query = vi.fn(async (name: string) => {
    if (name === "video.preparePreview") {
      return {
        ok: true,
        url: "pond://_video_cache/compatible-video.mp4",
      };
    }
    return PrefsSchema.parse({});
  });
  vi.stubGlobal("pond", {
    query,
    tx: async () => ({ ok: true }),
    openSaveFile: async () => ({ ok: true }),
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

async function fail(imageElement: HTMLImageElement): Promise<void> {
  await act(async () => {
    imageElement.dispatchEvent(new Event("error", { bubbles: true }));
  });
}

it("keeps a failed only slide visible through generated and file fallback", async () => {
  const save = imageSave("single-failure", [image("reference.jpg")]);
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));

  const direct = host.querySelector<HTMLImageElement>("img");
  if (!direct) {
    throw new Error("Missing direct image");
  }
  await fail(direct);

  const generated = host.querySelector<HTMLImageElement>("img");
  expect(generated?.src).toContain("preview=2048");
  if (!generated) {
    throw new Error("Missing generated image");
  }
  await fail(generated);

  expect(host.textContent).toContain("This preview could not be rendered.");
  expect(
    host.querySelector('button[aria-label="Open in Default App"]'),
  ).not.toBeNull();
  expect(host.querySelectorAll("[data-blossom-slide]")).toHaveLength(1);
  expect(
    host.querySelector("[data-blossom-slide]")?.getAttribute("data-file-index"),
  ).toBe("0");

  const replaced = imageSave(save.id, [image("replacement.jpg")]);
  pool.upsert(replaced);
  await act(async () => root.render(<MediaViewer save={replaced} />));

  expect(host.querySelector("[data-viewer-fallback]")).toBeNull();
  expect(host.querySelector("img")?.getAttribute("src")).toContain(
    "replacement.jpg",
  );
  expect(host.querySelector("img")?.getAttribute("src")).not.toContain(
    "preview=2048",
  );
});

it("does not change slide count or file indices when one item fails", async () => {
  const save = imageSave("multi-failure", [
    image("first.jpg"),
    image("second.jpg"),
    image("third.jpg"),
  ]);
  pool.upsert(save);
  resultNavigation.setSource({ ids: [save.id], total: 1 });

  await act(async () => root.render(<MediaViewer save={save} />));

  const images = host.querySelectorAll<HTMLImageElement>("img");
  const second = images[1];
  if (!second) {
    throw new Error("Missing second image");
  }
  await fail(second);
  const generatedSecond = host.querySelectorAll<HTMLImageElement>("img")[1];
  if (!generatedSecond) {
    throw new Error("Missing generated second image");
  }
  await fail(generatedSecond);

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
  query.mockImplementation(async (name: string) => {
    if (name === "video.preparePreview") {
      return { ok: false };
    }
    return PrefsSchema.parse({});
  });
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

  const video = host.querySelector("video");
  if (!video) {
    throw new Error("Missing video");
  }
  await act(async () => {
    video.dispatchEvent(new Event("error", { bubbles: true }));
    await Promise.resolve();
  });

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

  const original = host.querySelector<HTMLVideoElement>("video");
  if (!original) {
    throw new Error("Missing original video");
  }
  await act(async () => {
    original.dispatchEvent(new Event("error", { bubbles: true }));
    await Promise.resolve();
  });

  expect(query).toHaveBeenCalledWith("video.preparePreview", {
    src: expect.stringContaining("legacy.avi"),
  });
  const proxy = host.querySelector<HTMLVideoElement>("video");
  expect(proxy?.getAttribute("src")).toBe(
    "pond://_video_cache/compatible-video.mp4",
  );
  expect(host.querySelector("[data-viewer-fallback]")).toBeNull();

  if (!proxy) {
    throw new Error("Missing compatible video preview");
  }
  await act(async () => {
    proxy.dispatchEvent(new Event("error", { bubbles: true }));
  });

  expect(
    query.mock.calls.filter(([name]) => name === "video.preparePreview"),
  ).toHaveLength(1);
  expect(host.querySelector("[data-viewer-fallback]")).not.toBeNull();
});
