import type { SaveFile } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { repairYoutubeShortPosters } from "./youtube-short-poster-repair";

function poster(sourceUrl?: string): SaveFile {
  const file: SaveFile = {
    kind: "poster",
    path: "poster-1.jpg",
    sha256: "",
    size: 1,
    mimeType: "image/jpeg",
  };
  if (sourceUrl) file.sourceUrl = sourceUrl;
  return file;
}

function library(rows: Array<{ id: string; files: Array<SaveFile> | null }>) {
  let marker: string | null = null;
  const ensured: Array<string> = [];
  return {
    ensured,
    marker: () => marker,
    runtime: {
      listYoutubeSaves: async () => rows,
      ensurePoster: async (saveId: string) => {
        ensured.push(saveId);
        if (saveId === "broken") throw new Error("network down");
      },
      readMarker: async () => marker,
      writeMarker: async (value: string) => {
        marker = value;
      },
    },
  };
}

describe("repairYoutubeShortPosters", () => {
  it("fetches posters again only for Saves whose poster is an automatic frame", async () => {
    const { runtime, ensured } = library([
      {
        id: "frame",
        files: [poster("https://i.ytimg.com/vi/-st95jSkprQ/oar2.jpg")],
      },
      {
        id: "first",
        files: [poster("https://i.ytimg.com/vi/dbXWZjYJ8t8/frame0.jpg")],
      },
      {
        id: "cover",
        files: [poster("https://i.ytimg.com/vi/m6CRWM9sUzU/sardefault.jpg")],
      },
      {
        id: "landscape",
        files: [poster("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")],
      },
      { id: "unknown", files: [poster()] },
      { id: "empty", files: null },
    ]);

    expect(await repairYoutubeShortPosters(runtime)).toEqual({ repaired: 2 });
    expect(ensured).toEqual(["frame", "first"]);
  });

  it("runs once per Library, even when one Save fails", async () => {
    const lib = library([
      {
        id: "broken",
        files: [poster("https://i.ytimg.com/vi/-st95jSkprQ/oar2.jpg")],
      },
      {
        id: "frame",
        files: [poster("https://i.ytimg.com/vi/dbXWZjYJ8t8/oar2.jpg")],
      },
    ]);

    expect(await repairYoutubeShortPosters(lib.runtime)).toEqual({
      repaired: 1,
    });
    expect(lib.marker()).toBe("1");
    expect(await repairYoutubeShortPosters(lib.runtime)).toEqual({
      repaired: 0,
    });
    expect(lib.ensured).toEqual(["broken", "frame"]);
  });
});
