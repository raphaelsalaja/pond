import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaViewer } from "@/features/saves/components/viewers/media-viewer";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import { GeneratedRasterViewer } from ".";

function generatedSave(extension: string): Save {
  return {
    id: `generated-${extension}`,
    source: "local",
    sourceId: `generated-${extension}`,
    url: "https://example.test/reference",
    title: `${extension.toUpperCase()} reference`,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "file",
    files: [
      {
        path: `reference.${extension}`,
        kind: "file",
        size: 1,
        sha256: `fixture-${extension}`,
        mimeType: "application/octet-stream",
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("generated raster viewer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    bridge.use({
      query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each(["dng", "psd", "docx"])(
    "uses image inspection semantics for a generated .%s preview",
    async (extension) => {
      const save = generatedSave(extension);
      pool.upsert(save);
      const originalUrl = `pond://${save.id}/reference.${extension}`;

      await act(async () => {
        root.render(
          <ViewerChrome>
            <GeneratedRasterViewer
              save={save}
              fileIndex={0}
              url={originalUrl}
              active
              onError={() => {}}
            />
          </ViewerChrome>,
        );
      });

      const labeled = (label: string) =>
        host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      const image = host.querySelector<HTMLImageElement>("img");

      expect(image?.getAttribute("src")).toContain(
        `${originalUrl}?preview=2048`,
      );
      expect(labeled("Actual Size")).not.toBeNull();
      expect(labeled("Fit to Window")).not.toBeNull();
      expect(labeled("Open in Default App")).not.toBeNull();
      expect(labeled("Export Original")).not.toBeNull();
      expect(labeled("Flip")).toBeNull();
      expect(labeled("Rotate")).toBeNull();
      expect(labeled("Crop")).toBeNull();
    },
  );

  it("applies the same generated-raster controls to media-classified images", async () => {
    const save = generatedSave("heic");
    save.mediaType = "image";
    const file = save.files[0];
    if (!file) {
      throw new Error("Missing fixture file");
    }
    file.kind = "image";
    file.mimeType = "image/heic";
    pool.upsert(save);

    await act(async () => {
      root.render(<MediaViewer save={save} />);
    });

    const labeled = (label: string) =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(host.querySelector("img")?.getAttribute("src")).toContain(
      "reference.heic?",
    );
    expect(host.querySelector("img")?.getAttribute("src")).toContain(
      "preview=2048",
    );
    expect(labeled("Open in Default App")).not.toBeNull();
    expect(labeled("Export Original")).not.toBeNull();
    expect(labeled("Flip")).toBeNull();
    expect(labeled("Rotate")).toBeNull();
    expect(labeled("Crop")).toBeNull();
  });
});
