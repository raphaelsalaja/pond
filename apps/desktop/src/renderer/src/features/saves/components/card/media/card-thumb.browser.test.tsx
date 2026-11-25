import { PrefsSchema } from "@pond/schema";
import type { Prefs } from "@pond/schema";
import { isHTMLElement } from "@pond/ui/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { MediaUnit } from "@/features/saves/lib/media/units";
import { cardThumbnailFor } from "@/features/saves/state/card-thumbnails";
import type { Save } from "@/features/saves/types";
import { loadPrefs, savePrefsSection } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
import { PreparedCardThumb } from "./";

let viewer: Partial<Prefs["viewer"]> = {};

function currentPrefs(): Prefs {
  const base = PrefsSchema.parse({});
  return { ...base, viewer: { ...base.viewer, ...viewer } };
}

function imageUrl(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.toDataURL("image/png");
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    machinePace: async () => ({ thermal: "nominal", onBattery: false }),
    query: {
      "settings.getPrefs": () => currentPrefs(),
      "settings.setPrefs": () => ({ ok: true, prefs: currentPrefs() }),
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const save: Save = {
  id: "gallery",
  source: "web",
  sourceId: "gallery",
  url: "https://example.test/gallery",
  title: "Gallery",
  description: null,
  author: null,
  notes: null,
  mediaUrl: null,
  mediaType: "image",
  files: [
    {
      kind: "image",
      path: "first.jpg",
      sha256: "a",
      size: 1,
      width: 800,
      height: 600,
    },
    {
      kind: "image",
      path: "second.jpg",
      sha256: "b",
      size: 1,
      width: 800,
      height: 600,
    },
  ],
  tags: [],
  savedAt: 0,
  createdAt: 0,
  deletedAt: null,
};

const first: MediaUnit = {
  key: "first.jpg",
  url: imageUrl(4, 3),
  isVideo: false,
};
const second: MediaUnit = {
  key: "second.jpg",
  url: imageUrl(3, 4),
  isVideo: false,
};
const slides: Array<MediaUnit> = [first, second];

async function setViewerPrefs(next: Partial<Prefs["viewer"]>): Promise<void> {
  viewer = next;
  await savePrefsSection("viewer", next);
}

async function renderThumb(): Promise<HTMLElement> {
  await loadPrefs();
  await act(async () => {
    root.render(
      <PreparedCardThumb
        save={save}
        mediaUnits={slides}
        pickOptions={{}}
        unit={first}
        primary={save.files[0] ?? null}
      />,
    );
  });
  const thumb = host.firstElementChild;
  if (!isHTMLElement(thumb)) {
    throw new Error("Missing card thumb");
  }
  return thumb;
}

function moveTo(thumb: HTMLElement, fraction: number): Promise<void> {
  const bounds = thumb.getBoundingClientRect();
  const clientX = bounds.left + bounds.width * fraction;
  return act(async () => {
    thumb.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX, clientY: 40 }),
    );
  });
}

function loaded(image: HTMLImageElement): Promise<void> {
  return act(async () => {
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
      });
    }
  });
}

function activeSlide(): string | null | undefined {
  return host.querySelector("img[data-active='true']")?.getAttribute("src");
}

it("scrubs gallery thumbnails with the pointer when scrub on hover is selected", async () => {
  await setViewerPrefs({ thumbnailBehavior: "scrub" });
  const thumb = await renderThumb();
  expect(activeSlide()).toBe(first.url);

  await moveTo(thumb, 0.9);

  expect(activeSlide()).toBe(second.url);
});

it("keeps a post screenshot cover out of the viewer placeholder for the post's media", async () => {
  const post: Save = {
    ...save,
    id: "post",
    source: "twitter",
    files: [
      {
        kind: "image",
        path: "media-1.jpg",
        sha256: "a",
        size: 1,
        width: 800,
        height: 600,
      },
      {
        kind: "tweet_screenshot_light",
        path: "tweet-light.png",
        sha256: "b",
        size: 1,
      },
    ],
  };
  const media: MediaUnit = {
    key: "media-1.jpg",
    url: imageUrl(8, 6),
    isVideo: false,
  };
  const cover: MediaUnit = {
    key: "tweet-light.png",
    url: imageUrl(6, 8),
    isVideo: false,
  };

  await loadPrefs();
  await act(async () => {
    root.render(
      <PreparedCardThumb
        save={post}
        mediaUnits={[media]}
        pickOptions={{ tweetCover: "screenshot" }}
        unit={cover}
        primary={post.files[0] ?? null}
      />,
    );
  });
  const image = host.querySelector("img");
  if (!image) {
    throw new Error("Missing card image");
  }
  await loaded(image);

  expect(cardThumbnailFor(cover.url)).toBe(image.src);
  expect(cardThumbnailFor(media.url)).toBeNull();
});

it("keeps gallery thumbnails on the first image when thumbnail behavior is still", async () => {
  await setViewerPrefs({ thumbnailBehavior: "still" });
  const thumb = await renderThumb();

  await moveTo(thumb, 0.9);

  expect(activeSlide()).toBe(first.url);
});
