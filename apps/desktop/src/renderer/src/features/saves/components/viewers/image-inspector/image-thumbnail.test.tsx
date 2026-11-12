import { PrefsSchema } from "@pond/schema";
import type { SaveFile } from "@pond/schema/db";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { ImageInspector } from ".";

function imageFile(path: string, mimeType = "image/jpeg"): SaveFile {
  return {
    kind: "image",
    path,
    sha256: `sha-${path}`,
    size: 10,
    mimeType,
    width: 40,
    height: 30,
  };
}

function saveWith(id: string, files: SaveFile[]): Save {
  return {
    id,
    source: "web",
    sourceId: id,
    url: "https://example.test/carousel",
    title: "Carousel",
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

describe("current image thumbnail", () => {
  let host: HTMLDivElement;
  let root: Root;
  const query = vi.fn(async (name: string) => {
    if (name === "settings.getPrefs") return PrefsSchema.parse({});
    return { ok: true };
  });

  beforeEach(() => {
    query.mockClear();
    vi.stubGlobal("pond", {
      query,
      tx: async () => ({ ok: true }),
      appInfo: async () => ({ username: "Raphael Salaja" }),
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

  async function render(save: Save, fileIndex: number) {
    pool.upsert(save);
    const file = save.files[fileIndex];
    if (!file) throw new Error("Missing carousel file");
    await act(async () => {
      root.render(
        <ImageInspector
          save={save}
          fileIndex={fileIndex}
          src={`pond://${save.id}/${file.path}`}
          active
          onRatio={() => {}}
          onError={() => {}}
        />,
      );
    });
  }

  function thumbnailButton(): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(
      'button[aria-label="Set Current Image as Thumbnail"]',
    );
  }

  it("sets the image on screen as the thumbnail for a multi-image save", async () => {
    const save = saveWith("carousel", [
      imageFile("one.jpg"),
      imageFile("two.jpg"),
    ]);
    await render(save, 1);

    const button = thumbnailButton();
    expect(button).not.toBeNull();
    await act(async () => button?.click());

    expect(query).toHaveBeenCalledWith("saves.setImageThumbnail", {
      id: "carousel",
      src: "pond://carousel/two.jpg",
    });
  });

  it("hides the action when the save has a single image", async () => {
    await render(saveWith("single", [imageFile("only.jpg")]), 0);
    expect(thumbnailButton()).toBeNull();
  });
});
