import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save, SaveFile } from "@/features/saves/types";
import { SaveViewer } from ".";

function file(path: string, kind: string, mimeType: string): SaveFile {
  return { path, kind, mimeType, sha256: `fixture-${path}`, size: 1 };
}

function mixedSave(files: SaveFile[]): Save {
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

function labeledButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing ${label} button`);
  return button;
}

function slideControls(host: HTMLElement): (string | null)[] {
  return [...host.querySelectorAll('[data-viewer-bar-slot="end"] button')].map(
    (button) => button.getAttribute("aria-label"),
  );
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

async function click(host: HTMLElement, label: string): Promise<void> {
  await act(async () => labeledButton(host, label).click());
}

async function findToolbar(host: HTMLElement, label: string): Promise<void> {
  await vi.waitFor(() => {
    if (!host.querySelector(`[role="toolbar"][aria-label="${label}"]`))
      throw new Error(`Missing ${label} toolbar`);
  });
}

describe("SaveViewer", () => {
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
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("fetch", async () => {
      throw new Error("Offline fixture");
    });
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
    vi.stubGlobal("pond", {
      openSaveFile: async () => ({ ok: true }),
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

    await act(async () => root.render(<SaveViewer save={save} />));

    expect(host.querySelector('img[alt="Mixed viewer"]')).not.toBeNull();
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(slideControls(host)).toEqual(["Previous Slide", "Next Slide"]);
    expect(labeledButton(host, "Previous Slide").disabled).toBe(true);

    await click(host, "Next Slide");
    await findToolbar(host, "PDF");
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(slideControls(host)).toEqual(["Previous Slide", "Next Slide"]);

    await click(host, "Next Slide");
    await findToolbar(host, "Font");
    expect(labeledButton(host, "Next Slide").disabled).toBe(true);
    expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
    expect(slideControls(host)).toEqual(["Previous Slide", "Next Slide"]);
  });

  it("keeps later image and font originals reachable when PDF is first", async () => {
    const save = mixedSave([
      file("reference.pdf", "file", "application/pdf"),
      file("reference.jpg", "image", "image/jpeg"),
      file("reference.woff2", "file", "font/woff2"),
    ]);
    pool.upsert(save);
    resultNavigation.setSource({ ids: [save.id], total: 1 });

    await act(async () => root.render(<SaveViewer save={save} />));

    await findToolbar(host, "PDF");
    await click(host, "Next Slide");
    expect(host.querySelector('img[alt="Mixed viewer"]')).not.toBeNull();
    await click(host, "Next Slide");
    await findToolbar(host, "Font");
  });

  it("offers Download Video until the video file arrives", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const queries: string[] = [];
    vi.stubGlobal("pond", {
      openSaveFile: async () => ({ ok: true }),
      query: async (name: string) => {
        queries.push(name);
        return name === "saves.downloadVideo"
          ? { ok: true, queued: 1 }
          : PrefsSchema.parse({});
      },
      tx: async () => ({ ok: true }),
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
    if (!download) throw new Error("Missing Download Video button");
    await act(async () => download.click());
    expect(queries).toContain("saves.downloadVideo");
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
    const bottom = host.querySelector('[data-slot="bottom"]');
    expect(notice).not.toBeNull();
    expect(zoom).not.toBeNull();
    expect(bottom?.contains(zoom)).toBe(true);
    expect(bottom?.contains(notice)).toBe(true);
    expect(notice?.closest('[data-anchor="bottom-center"]')).toBeNull();
    expect(zoom?.closest('[data-placement="above-chrome"]')).toBeNull();
    expect(notice?.closest('[data-placement="above-chrome"]')).toBe(
      notice?.parentElement,
    );
  });
});
