import { PrefsSchema } from "@pond/schema";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { libraryViewContext } from "@/features/saves/state/view-context";
import type { Save } from "@/features/saves/types";
import { MediaViewer } from "..";
import { ChromePortal, ViewerChrome } from ".";

const save: Save = {
  id: "chrome-save",
  source: "web",
  sourceId: "test",
  url: "https://example.test",
  title: "Reference",
  description: null,
  author: null,
  notes: null,
  mediaUrl: null,
  mediaType: "image",
  files: [
    {
      path: "reference.jpg",
      kind: "image",
      size: 1,
      sha256: "fixture",
      width: 800,
      height: 400,
      mimeType: "image/jpeg",
    },
  ],
  tags: [],
  savedAt: 0,
  createdAt: 0,
  deletedAt: null,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
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
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: () => {},
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  pool.upsert(save);
  libraryViewContext.set(["chrome-save", "other"], "library");
  resultNavigation.setSource({
    ids: ["chrome-save", "other"],
    total: 493,
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  libraryViewContext.set([], "library");
  resultNavigation.setSource({ ids: [] });
});

it("places image inspector controls in the integrated top toolbar", async () => {
  await act(async () => {
    root.render(<MediaViewer save={save} />);
  });
  const frame = host.querySelector("[data-background]");
  const fit = [...host.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Fit to Window",
  );
  expect(host.querySelector('[aria-label="Previous Save"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Previous Item"]')).toBeNull();
  expect(host.querySelector('[aria-label="Next Item"]')).toBeNull();
  expect(fit).toBeTruthy();
  expect(frame?.contains(fit ?? null)).toBe(false);
  expect(fit?.closest("[data-blossom-slide]")).toBeNull();
  expect(fit?.closest("[data-slot]")?.getAttribute("data-slot")).toBe("top");
  expect(fit?.closest("[data-anchor]")).toBeNull();
  const viewerRoot = host.querySelector("[data-viewer-root]");
  const topSlot = host.querySelector('[data-slot="top"]');
  expect(viewerRoot?.contains(fit ?? null)).toBe(true);
  expect(topSlot?.parentElement?.parentElement).toBe(viewerRoot);
});

it("mounts toolbars in the chrome bar before stage layout effects measure", async () => {
  const bars: Record<string, Element | null | undefined> = {};
  function Stage() {
    useLayoutEffect(() => {
      for (const probe of host.querySelectorAll("[data-probe]")) {
        bars[probe.getAttribute("data-probe") ?? ""] =
          probe.closest("[data-slot]")?.parentElement;
      }
    }, []);
    return (
      <>
        <ChromePortal slot="top">
          <span data-probe="top" />
        </ChromePortal>
        <ChromePortal slot="bottom">
          <span data-probe="bottom" />
        </ChromePortal>
      </>
    );
  }

  await act(async () => {
    root.render(
      <ViewerChrome>
        <Stage />
      </ViewerChrome>,
    );
  });

  const viewerRoot = host.querySelector("[data-viewer-root]");
  expect(bars.top?.parentElement).toBe(viewerRoot);
  expect(bars.bottom?.parentElement).toBe(viewerRoot);
});

it("shows only media when controls are disabled", async () => {
  await act(async () => {
    root.render(<MediaViewer save={save} showControls={false} />);
  });

  expect(host.querySelector("[aria-label='Image']")).toBeTruthy();
  expect(host.querySelector("[data-slot]")).toBeNull();
  expect(host.querySelector("[aria-label='Fit to Window']")).toBeNull();
  expect(
    host.querySelector("[data-viewer-root]")?.hasAttribute("data-chrome"),
  ).toBe(false);
});

it("suppresses portal toolbars and direct HUD overlays when controls are disabled", async () => {
  await act(async () => {
    root.render(
      <ViewerChrome enabled={false}>
        <div>
          <ChromePortal slot="top">
            <ViewerHud.Bar label="Book" />
          </ChromePortal>
          <ViewerHud.Root>
            <ViewerHud.Cluster anchor="bottom-center">
              <button type="button" aria-label="Table of contents">
                Contents
              </button>
            </ViewerHud.Cluster>
          </ViewerHud.Root>
        </div>
      </ViewerChrome>,
    );
  });

  expect(host.querySelector('[role="toolbar"]')).toBeNull();
  expect(host.querySelector('[aria-label="Table of contents"]')).toBeNull();
});

it("shows the slide count beside the slide arrows", async () => {
  const first = save.files[0];
  if (!first) throw new Error("Missing fixture file");
  const gallery: Save = {
    ...save,
    id: "gallery-save",
    files: [
      first,
      {
        ...first,
        path: "second.jpg",
        sha256: "fixture-2",
      },
    ],
  };
  pool.upsert(gallery);
  resultNavigation.setSource({
    ids: ["before", "gallery-save", "after"],
    total: 493,
  });
  await act(async () => {
    root.render(<MediaViewer save={gallery} />);
  });
  const labeled = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === label,
    );
  const zoom = labeled("Zoom In");
  const crop = labeled("Crop");
  expect(host.textContent).not.toContain("2 / 493");
  expect(host.textContent).toContain("1 / 2");
  expect(labeled("Previous Item")).toBeUndefined();
  expect(labeled("Next Item")).toBeUndefined();
  expect(labeled("Previous Slide")?.disabled).toBe(true);
  expect(labeled("Next Slide")?.disabled).toBe(false);
  expect(crop?.closest("[data-slot]")?.getAttribute("data-slot")).toBe("top");
  expect(zoom?.closest("[data-slot]")?.getAttribute("data-slot")).toBe(
    "bottom",
  );
  expect(crop?.closest("[data-anchor]")).toBeNull();
  expect(zoom?.closest("[data-anchor]")).toBeNull();
  expect(crop?.closest("[data-blossom-slide]")).toBeNull();
  expect(zoom?.closest("[data-blossom-slide]")).toBeNull();
});

it("composes video result count and actions into one top bar", async () => {
  const videoFile = {
    path: "clip.mp4",
    kind: "video" as const,
    size: 1,
    sha256: "video-fixture",
    width: 1920,
    height: 1080,
    mimeType: "video/mp4",
  };
  const videoSave: Save = {
    ...save,
    id: "video-save",
    mediaType: "video",
    files: [
      videoFile,
      {
        ...videoFile,
        path: "second.mp4",
        sha256: "video-fixture-2",
      },
    ],
  };
  pool.upsert(videoSave);
  resultNavigation.setSource({ ids: ["video-save"], total: 1 });

  await act(async () => {
    root.render(<MediaViewer save={videoSave} />);
  });

  const top = host.querySelector('[data-slot="top"]');
  expect(top?.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
  expect(
    top?.querySelector('[role="toolbar"]')?.getAttribute("aria-label"),
  ).toBe("Video");
  expect(top?.querySelector('[aria-label="Next Save"]')).not.toBeNull();
  expect(top?.textContent).not.toContain("1 / 1");
  expect(top?.querySelector('[aria-label="Rotate Video"]')).not.toBeNull();
  expect(top?.querySelector('[aria-label="Fill"]')).toBeNull();
  expect(top?.querySelector('[aria-label="Fit"]')).toBeNull();
  expect(top?.querySelectorAll('[role="separator"]')).toHaveLength(0);
  const center = top?.querySelector('[data-viewer-bar-slot="center"]');
  const end = top?.querySelector('[data-viewer-bar-slot="end"]');
  expect(center?.querySelector('[aria-label="Rotate Video"]')).not.toBeNull();
  expect(end?.querySelector('[aria-label="Previous Slide"]')).not.toBeNull();
  expect(end?.querySelector('[aria-label="Next Slide"]')).not.toBeNull();
  expect(end?.textContent).toBe("1 / 2");
});
