import { type Prefs, PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaUnit } from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";
import { loadPrefs } from "@/shared/state/prefs";
import { PreparedCardThumb } from "./";

const listeners = new Set<(prefs: Prefs) => void>();
let viewer: Partial<Prefs["viewer"]> = {};

function currentPrefs(): Prefs {
  const base = PrefsSchema.parse({});
  return { ...base, viewer: { ...base.viewer, ...viewer } };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("pond", {
    onPrefsChanged(listener: (prefs: Prefs) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    query: async (name: string) => {
      if (name === "settings.getPrefs") return currentPrefs();
      if (name === "settings.setPrefs")
        return { ok: true, prefs: currentPrefs() };
      return { ok: true };
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
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

const slides: MediaUnit[] = [
  { key: "first.jpg", url: "pond://gallery/first.jpg", isVideo: false },
  { key: "second.jpg", url: "pond://gallery/second.jpg", isVideo: false },
];

async function renderThumb(): Promise<HTMLElement> {
  await loadPrefs();
  for (const listener of listeners) listener(currentPrefs());
  await act(async () => {
    root.render(
      <PreparedCardThumb
        save={save}
        mediaUnits={slides}
        pickOptions={{}}
        unit={slides[0] ?? null}
        primary={save.files[0] ?? null}
      />,
    );
  });
  const thumb = host.firstElementChild;
  if (!(thumb instanceof HTMLElement)) throw new Error("Missing card thumb");
  vi.spyOn(thumb, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 200, 100),
  );
  return thumb;
}

function moveTo(thumb: HTMLElement, clientX: number): Promise<void> {
  return act(async () => {
    thumb.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX, clientY: 40 }),
    );
  });
}

it("scrubs gallery thumbnails with the pointer when scrub on hover is selected", async () => {
  viewer = { thumbnailBehavior: "scrub" };
  const thumb = await renderThumb();
  expect(
    host.querySelector("img[data-active='true']")?.getAttribute("src"),
  ).toContain("first.jpg");

  await moveTo(thumb, 180);

  expect(
    host.querySelector("img[data-active='true']")?.getAttribute("src"),
  ).toContain("second.jpg");
});

it("keeps gallery thumbnails on the first image when thumbnail behavior is still", async () => {
  viewer = { thumbnailBehavior: "still" };
  const thumb = await renderThumb();

  await moveTo(thumb, 180);

  expect(
    host.querySelector("img[data-active='true']")?.getAttribute("src"),
  ).toContain("first.jpg");
});
