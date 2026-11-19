import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import {
  closeThumbnailViewer,
  openThumbnailViewer,
} from "@/features/saves/state/thumbnail-viewer";
import type { Save, SaveFile } from "@/features/saves/types";
import { ThumbnailViewerHost } from ".";

function file(kind: string, path: string, sha256: string): SaveFile {
  return { kind, path, sha256, size: 1 };
}

function save(id: string, files: SaveFile[]): Save {
  return {
    id,
    source: "local",
    sourceId: id,
    url: `pond:local/${id}`,
    title: `Title ${id}`,
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

describe("ThumbnailViewerHost", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("pond", {
      onPrefsChanged: () => () => {},
      query: async (name: string) =>
        name === "settings.getPrefs" ? PrefsSchema.parse({}) : { ok: true },
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    document.documentElement.dataset.theme = "light";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<ThumbnailViewerHost />));
  });

  afterEach(async () => {
    closeThumbnailViewer();
    await act(async () => root.unmount());
    host.remove();
    pool.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
  });

  async function view(target: Save) {
    pool.upsert(target);
    await act(async () => openThumbnailViewer(target.id));
  }

  const dialog = () =>
    document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Thumbnail"]',
    );
  const image = () => dialog()?.querySelector("img") ?? null;

  it("shows the card's Thumbnail rather than the original", async () => {
    await view(
      save("photo", [
        file("image", "photo.jpg", "originalsha256"),
        file("thumbnail", "photo_thumbnail.png", "thumbnailsha256"),
      ]),
    );

    expect(dialog()).not.toBeNull();
    expect(image()?.getAttribute("src")).toBe(
      "pond://photo/photo_thumbnail.png?v=thumbnailsha",
    );
    expect(image()?.alt).toBe("Title photo");
  });

  it("shows the Thumbnail for the current theme", async () => {
    document.documentElement.dataset.theme = "dark";
    await view(
      save("themed", [
        file("image", "photo.jpg", "originalsha256"),
        file("thumbnail", "light_thumbnail.png", "lightsha256xx"),
        file("thumbnail_dark", "dark_thumbnail.png", "darksha256xxx"),
      ]),
    );

    expect(image()?.getAttribute("src")).toBe(
      "pond://themed/dark_thumbnail.png?v=darksha256xx",
    );
  });

  it("shows a video's poster instead of playing it", async () => {
    await view(
      save("clip", [
        file("video", "clip.mp4", "videosha256xx"),
        file("poster", "clip_poster.jpg", "postersha256x"),
      ]),
    );

    expect(dialog()?.querySelector("video")).toBeNull();
    expect(image()?.getAttribute("src")).toBe(
      "pond://clip/clip_poster.jpg?v=postersha256",
    );
  });

  it("follows a new Thumbnail while open", async () => {
    const files = [file("image", "photo.jpg", "originalsha256")];
    await view(
      save("custom", [
        ...files,
        file("thumbnail", "photo_thumbnail.png", "firstsha256xx"),
      ]),
    );
    await act(async () =>
      pool.upsert(
        save("custom", [
          ...files,
          file("thumbnail", "photo_thumbnail.png", "secondsha256x"),
        ]),
      ),
    );

    expect(image()?.getAttribute("src")).toBe(
      "pond://custom/photo_thumbnail.png?v=secondsha256",
    );
  });

  it("says so when the Thumbnail can't load", async () => {
    await view(
      save("broken", [
        file("thumbnail", "photo_thumbnail.png", "brokensha256x"),
      ]),
    );
    await act(async () => image()?.dispatchEvent(new Event("error")));

    expect(image()).toBeNull();
    expect(dialog()?.textContent).toContain("Couldn't load the thumbnail");
  });
});
