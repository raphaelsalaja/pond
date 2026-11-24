import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerNavigation } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save, SaveFile } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import { SaveViewer } from ".";

function file(path: string, kind: string, mimeType: string): SaveFile {
  return { path, kind, mimeType, sha256: `fixture-${path}`, size: 1 };
}

function mixedSave(files: Array<SaveFile>): Save {
  return {
    id: "mixed-viewer",
    source: "local",
    sourceId: "mixed-viewer",
    url: "https://example.test/mixed-viewer",
    title: "Mixed viewer",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "file",
    files,
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

function buttonByText(
  host: HTMLElement,
  text: string,
): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    ) ?? null
  );
}

function imageSave(id: string): Save {
  return {
    ...mixedSave([file(`${id}.jpg`, "image", "image/jpeg")]),
    id,
    sourceId: id,
    mediaType: "image",
  };
}

function videoSave(id: string): Save {
  return {
    ...mixedSave([
      file(`${id}.mp4`, "video", "video/mp4"),
      file(`${id}-poster.jpg`, "poster", "image/jpeg"),
    ]),
    id,
    sourceId: id,
    mediaType: "video",
  };
}

function fileName(src: string | null | undefined) {
  return src?.split("?")[0]?.split("/").pop();
}

async function findToolbar(host: HTMLElement, label: string): Promise<void> {
  await vi.waitFor(() => {
    if (!host.querySelector(`[role="toolbar"][aria-label="${label}"]`)) {
      throw new Error(`Missing ${label} toolbar`);
    }
  });
}

describe("SaveViewer", () => {
  let host: HTMLDivElement;
  let root: Root;
  /** jsdom has no image decoding, so tests settle `decode()` explicitly. */
  let decodes: Array<{ src: string; resolve: () => void }> = [];
  let navigation: ViewerNavigation | undefined;

  const viewer = (save: Save) => (
    <SaveViewer
      save={save}
      onNavigationChange={(next) => {
        navigation = next;
      }}
    />
  );
  const next = () =>
    act(async () => {
      navigation?.onNext();
    });
  const decodeImage = (name: string) =>
    act(async () => {
      for (const pending of decodes) {
        if (pending.src.includes(`/${name}`)) {
          pending.resolve();
        }
      }
    });
  const decodeFile = (name: string) =>
    act(async () => {
      for (const pending of decodes) {
        if (fileName(pending.src) === name) {
          pending.resolve();
        }
      }
    });
  const layers = () => {
    const images = host.querySelectorAll('img[alt="Mixed viewer"]');
    return [...images].map((image) => {
      let role = "current";
      if (image.closest("[data-held]")) {
        role = "held";
      }
      if (image.closest("div[data-pending]")) {
        role = "pending";
      }
      const name = image.getAttribute("src")?.match(/\/(\w+)\.jpg/)?.[1];
      return `${role} ${name}`;
    });
  };
  const show = (save: Save) =>
    act(async () => {
      pool.upsert(save);
      root.render(<SaveViewer save={save} />);
    });
  const stage = () =>
    [...host.querySelectorAll<HTMLElement>("[data-blossom-slide]")].map(
      (slide) => {
        const layer = slide.closest("[data-held], div[data-pending]");
        let role = "current";
        if (layer?.hasAttribute("data-held")) {
          role = "held";
        } else if (layer) {
          role = "pending";
        }
        const media =
          slide.querySelector("video")?.getAttribute("src") ??
          slide.querySelector('img[src*=".jpg"]')?.getAttribute("src");
        return `${role} ${fileName(media)}`;
      },
    );
  const timing = () => {
    const elapsed = host.querySelectorAll('[aria-label="Elapsed time"]');
    const duration = host.querySelectorAll('[aria-label="Duration"]');
    const seek = host.querySelector('[aria-label="Seek"]');
    expect(elapsed).toHaveLength(1);
    expect(duration).toHaveLength(1);
    return {
      pending: [elapsed[0], duration[0], seek].map((part) =>
        part?.hasAttribute("data-pending"),
      ),
      duration: duration[0]?.textContent,
      seekDisabled: seek?.hasAttribute("data-disabled"),
    };
  };
  const loadMetadata = (name: string, seconds: number) =>
    act(async () => {
      const video = host.querySelector<HTMLVideoElement>(
        `video[src*="/${name}"]`,
      );
      if (!video) {
        throw new Error(`Missing ${name}`);
      }
      Object.defineProperty(video, "duration", {
        configurable: true,
        value: seconds,
      });
      video.dispatchEvent(new Event("loadedmetadata"));
    });

  beforeEach(() => {
    decodes = [];
    navigation = undefined;
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value(this: HTMLImageElement) {
        return new Promise<void>((resolve) => {
          decodes.push({ src: this.src, resolve });
        });
      },
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          return this;
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add() {}, delete() {} },
    });
    bridge.use({
      openSaveFile: async () => ({ ok: true }),
      query: {
        "settings.getPrefs": () => PrefsSchema.parse({}),
        "saves.fontStatus": () => ({ activated: false }),
        "saves.mediaTiming": () => ({ frameRate: null }),
        "video.preparePreview": () => ({ ok: false, error: "Unsupported" }),
      },
      tx: async () => {},
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
    host.remove();
    resultNavigation.setSource({ ids: [] });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("navigates every original file in a mixed-format Save", async () => {
    const save = mixedSave([
      file("reference.jpg", "image", "image/jpeg"),
      file("reference.pdf", "file", "application/pdf"),
      file("reference.woff2", "file", "font/woff2"),
    ]);
    pool.upsert(save);
    resultNavigation.setSource({ ids: [save.id], total: 1 });

    await act(async () => root.render(viewer(save)));

    expect(host.querySelector('img[alt="Mixed viewer"]')).not.toBeNull();
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Next Slide"]')).toBeNull();
    expect(navigation).toMatchObject({ index: 0, count: 3 });

    await next();
    await findToolbar(host, "PDF");
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(navigation?.index).toBe(1);

    await next();
    await findToolbar(host, "Font");
    expect(navigation?.index).toBe(2);
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Next Slide"]')).toBeNull();
  });

  it("keeps later image and font originals reachable when PDF is first", async () => {
    const save = mixedSave([
      file("reference.pdf", "file", "application/pdf"),
      file("reference.jpg", "image", "image/jpeg"),
      file("reference.woff2", "file", "font/woff2"),
    ]);
    pool.upsert(save);
    resultNavigation.setSource({ ids: [save.id], total: 1 });

    await act(async () => root.render(viewer(save)));

    await findToolbar(host, "PDF");
    await next();
    expect(host.querySelector('img[alt="Mixed viewer"]')).not.toBeNull();
    await next();
    await findToolbar(host, "Font");
  });

  describe("stepping between images", () => {
    it("keeps the shown image on screen until the next one decodes", async () => {
      const save = mixedSave([
        file("first.jpg", "image", "image/jpeg"),
        file("second.jpg", "image", "image/jpeg"),
      ]);
      pool.upsert(save);
      resultNavigation.setSource({ ids: [save.id], total: 1 });

      await act(async () => root.render(viewer(save)));
      await decodeImage("first.jpg");
      expect(layers()).toEqual(["current first"]);

      await next();
      expect(layers()).toEqual(["held first", "pending second"]);
      expect(navigation).toMatchObject({ index: 1, count: 2 });

      await decodeImage("second.jpg");
      expect(layers()).toEqual(["current second"]);
      const second = host.querySelector('img[src*="second.jpg"]');
      expect(second?.hasAttribute("data-pending")).toBe(false);
    });

    it("abandons a skipped image and holds the shown one for the newest", async () => {
      const save = mixedSave([
        file("first.jpg", "image", "image/jpeg"),
        file("second.jpg", "image", "image/jpeg"),
        file("third.jpg", "image", "image/jpeg"),
      ]);
      pool.upsert(save);
      resultNavigation.setSource({ ids: [save.id], total: 1 });

      await act(async () => root.render(viewer(save)));
      await decodeImage("first.jpg");
      await next();
      await next();
      expect(layers()).toEqual(["held first", "pending third"]);

      await decodeImage("second.jpg");
      expect(layers()).toEqual(["held first", "pending third"]);

      await decodeImage("third.jpg");
      expect(layers()).toEqual(["current third"]);
    });
  });

  describe("stepping between Saves", () => {
    beforeEach(() => {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
        () => {},
      );
    });

    it("never lets an earlier Save's decode reveal a newer one", async () => {
      await show(imageSave("first"));
      await decodeFile("first.jpg");
      await show(imageSave("second"));
      await show(imageSave("third"));
      expect(stage()).toEqual(["held first.jpg", "pending third.jpg"]);

      await decodeFile("second.jpg");
      expect(stage()).toEqual(["held first.jpg", "pending third.jpg"]);

      await decodeFile("third.jpg");
      expect(stage()).toEqual(["current third.jpg"]);
    });

    it("keeps an incoming video's timeline pending until its metadata loads", async () => {
      await show(imageSave("photo"));
      await decodeFile("photo.jpg");
      await show(videoSave("clip"));

      expect(stage()).toEqual(["held photo.jpg", "pending clip.mp4"]);
      const pending = host.querySelector("div[data-pending]");
      expect(
        pending?.querySelector('img[src^="pond://clip/clip-poster.jpg"]'),
      ).not.toBeNull();
      expect(
        pending?.querySelector("video")?.hasAttribute("data-pending"),
      ).toBe(true);
      expect(timing()).toMatchObject({
        pending: [true, true, true],
        seekDisabled: true,
      });

      await loadMetadata("clip.mp4", 45);

      expect(timing()).toEqual({
        pending: [false, false, false],
        duration: "0:45",
        seekDisabled: false,
      });
    });

    it("never shows the previous video's duration on the next one", async () => {
      await show(videoSave("short"));
      await loadMetadata("short.mp4", 45);
      expect(timing().duration).toBe("0:45");

      await show(videoSave("long"));

      expect(stage()).toEqual(["held short.mp4", "pending long.mp4"]);
      const next = timing();
      expect(next.pending).toEqual([true, true, true]);
      expect(next.duration).not.toBe("0:45");

      await loadMetadata("long.mp4", 200);
      expect(timing().duration).toBe("3:20");
    });

    it("keeps stepping when a video's metadata never arrives", async () => {
      await show(videoSave("stuck"));
      expect(timing().pending).toEqual([true, true, true]);

      await show(imageSave("after"));
      await decodeFile("after.jpg");

      expect(stage()).toEqual(["current after.jpg"]);
      expect(host.querySelector('[aria-label="Duration"]')).toBeNull();
    });
  });

  it("offers Download Video until the video file arrives", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    bridge.use({
      query: { "saves.downloadVideo": () => ({ ok: true, queued: 1 }) },
    });
    const poster = file("poster.jpg", "poster", "image/jpeg");
    const save: Save = {
      ...mixedSave([poster]),
      id: "poster-only",
      source: "twitter",
      mediaType: "video",
    };
    pool.upsert(save);

    await act(async () => root.render(<SaveViewer save={save} />));

    expect(host.querySelector('img[alt="Mixed viewer"]')).not.toBeNull();
    expect(buttonByText(host, "Open Original")).not.toBeNull();
    const download = buttonByText(host, "Download Video");
    if (!download) {
      throw new Error("Missing Download Video button");
    }
    await act(async () => download.click());
    expect(window.pond.query).toHaveBeenCalledWith("saves.downloadVideo", {
      ids: ["poster-only"],
    });
    expect(buttonByText(host, "Downloading")?.disabled).toBe(true);

    const downloaded: Save = {
      ...save,
      files: [file("clip.mp4", "video", "video/mp4"), poster],
    };
    await act(async () => root.render(<SaveViewer save={downloaded} />));
    expect(buttonByText(host, "Downloading")).toBeNull();
    expect(buttonByText(host, "Download Video")).toBeNull();
  });

  it("keeps zoom controls from covering the undownloaded video notice", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const poster = file("poster.jpg", "poster", "image/jpeg");
    const save: Save = {
      ...mixedSave([poster]),
      id: "poster-only",
      source: "twitter",
      mediaType: "video",
    };
    pool.upsert(save);

    await act(async () => root.render(<SaveViewer save={save} />));

    const notice = host.querySelector('[aria-label="Video download"]');
    const zoom = host.querySelector('[aria-label="Zoom In"]');
    const top = host.querySelector('[data-slot="top"]');
    const bottom = host.querySelector('[data-slot="bottom"]');
    expect(notice).not.toBeNull();
    expect(zoom).not.toBeNull();
    expect(top?.contains(zoom)).toBe(true);
    expect(bottom?.contains(notice)).toBe(true);
    expect(notice?.closest('[data-anchor="bottom-center"]')).toBeNull();
    expect(zoom?.closest('[data-placement="above-chrome"]')).toBeNull();
    expect(notice?.closest('[data-placement="above-chrome"]')).toBe(
      notice?.parentElement,
    );
  });
});
