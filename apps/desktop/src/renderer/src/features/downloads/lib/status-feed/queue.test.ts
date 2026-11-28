import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { humanizeError, projectQueue } from "./queue";

function save(partial: Partial<Save> & Pick<Save, "id" | "status">): Save {
  return {
    source: "twitter",
    sourceId: partial.id,
    url: `https://x.com/i/web/status/${partial.id}`,
    title: partial.title ?? null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    tasks: [],
    ...partial,
  };
}

describe("projectQueue", () => {
  it("splits ingesting and failed saves", () => {
    const { saving, failed } = projectQueue([
      save({ id: "a", status: "ingesting", title: "One" }),
      save({ id: "b", status: "failed", title: "Two" }),
      save({ id: "c", status: "complete", title: "Done" }),
    ]);
    expect(saving.map((r) => r.name)).toEqual(["One"]);
    expect(failed.map((r) => r.name)).toEqual(["Two"]);
  });
});

describe("humanizeError", () => {
  it("strips the error class prefix", () => {
    expect(humanizeError("TransientError: fetch_blobs: no media")).toBe(
      "No media",
    );
    expect(humanizeError("fetch-video-ytdlp: no video produced for save")).toBe(
      "No video produced for save",
    );
  });
});
