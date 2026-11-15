import { describe, expect, it } from "vitest";
import { dropPayload } from "./drop-payload";

function data(files: File[], text: Record<string, string>) {
  return { files, getData: (format: string) => text[format] ?? "" };
}

const pathFor = (file: File) => `/Users/me/Desktop/${file.name}`;

describe("overlay drop payload", () => {
  it("reads file paths first", () => {
    const dropped = data([new File(["x"], "a.png")], {
      "text/uri-list": "https://example.com",
    });
    expect(dropPayload(dropped, "moodboard", pathFor)).toEqual({
      kind: "files",
      folderId: "moodboard",
      paths: ["/Users/me/Desktop/a.png"],
    });
  });

  it("reads links dragged from a browser", () => {
    const dropped = data([], {
      "text/uri-list": "https://example.com/a\nhttps://example.com/b",
    });
    expect(dropPayload(dropped, "moodboard", pathFor)).toEqual({
      kind: "urls",
      folderId: "moodboard",
      urls: ["https://example.com/a", "https://example.com/b"],
    });
  });

  it("returns nothing for text that isn't a link or a file", () => {
    const dropped = data([], { "text/plain": "just some words" });
    expect(dropPayload(dropped, "moodboard", pathFor)).toBeNull();
  });

  it("skips files the platform can't resolve to a path", () => {
    const dropped = data([new File(["x"], "a.png")], {});
    const unresolved = () => {
      throw new Error("No path");
    };
    expect(dropPayload(dropped, "moodboard", unresolved)).toBeNull();
  });
});
