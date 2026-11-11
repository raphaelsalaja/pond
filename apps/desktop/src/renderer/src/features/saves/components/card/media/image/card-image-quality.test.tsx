import { PrefsSchema } from "@pond/schema";
import { THUMBNAIL_CACHE_VERSION } from "@shared/media-index";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Save } from "@/features/saves/types";
import { loadPrefs } from "@/shared/state/prefs";
import { CardImage } from ".";

let host: HTMLDivElement;
let root: Root;
/** jsdom has no image decoding, so the test settles each `decode()` itself. */
let decodes: Array<{ src: string; resolve: () => void }> = [];

const ORIGINAL = "pond://quality/photo.png";
const thumb = (width: number) =>
  `${ORIGINAL}?tw=${width}&tv=${THUMBNAIL_CACHE_VERSION}`;

const save: Save = {
  id: "quality",
  source: "local",
  sourceId: "quality",
  url: "https://example.test/quality",
  title: "Quality",
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
};

beforeEach(() => {
  decodes = [];
  vi.stubGlobal("pond", {
    query: async () =>
      PrefsSchema.parse({ viewer: { thumbnailQuality: "quality" } }),
    tx: async () => ({ ok: true }),
  });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value(this: HTMLImageElement) {
      return new Promise<void>((resolve) => {
        decodes.push({ src: this.getAttribute("src") ?? "", resolve });
      });
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  vi.unstubAllGlobals();
});

it("upgrades a large card to a sharper thumbnail, never the original", async () => {
  await loadPrefs();
  await act(async () =>
    root.render(
      <CardImage
        save={save}
        unit={{ key: "photo.png", url: ORIGINAL, isVideo: false }}
        pickOptions={{}}
        width={400}
        onBroken={() => {}}
      />,
    ),
  );
  const shown = () => host.querySelector("img")?.getAttribute("src");

  expect(shown()).toBe(thumb(512));
  expect(decodes.map(({ src }) => src)).toEqual([thumb(768)]);

  await act(async () => decodes[0]?.resolve());

  expect(shown()).toBe(thumb(768));
});
