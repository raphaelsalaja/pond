import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { Slide } from ".";
import type { MediaSlide } from ".";

function saveWithVideo(): Save {
  return {
    id: "poster-slide",
    source: "youtube",
    sourceId: "poster-slide",
    url: "https://example.test/video",
    title: "Video",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "video",
    files: [
      {
        path: "video.mp4",
        kind: "video",
        mimeType: "video/mp4",
        sha256: "video",
        size: 1,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

function videoSlide(posterIsCrossFile: boolean): MediaSlide {
  return {
    src: "pond://poster-slide/video.mp4",
    fileIndex: 0,
    isVideo: true,
    posterUrl: "pond://poster-slide/poster.jpg",
    posterIsCrossFile,
  };
}

describe("video poster slide", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(posterIsCrossFile: boolean) {
    await act(async () => {
      root.render(
        <Slide
          slide={videoSlide(posterIsCrossFile)}
          save={saveWithVideo()}
          active={false}
          inView={false}
        />,
      );
    });
  }

  it("uses an owned poster as an out-of-view video placeholder", async () => {
    await render(false);
    expect(
      host.querySelector('img[src="pond://poster-slide/poster.jpg"]'),
    ).not.toBeNull();
  });

  it("does not use a cross-file poster as an out-of-view video placeholder", async () => {
    await render(true);
    expect(
      host.querySelector('img[src="pond://poster-slide/poster.jpg"]'),
    ).toBeNull();
  });
});
