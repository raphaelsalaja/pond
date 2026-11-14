import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CreateManualParamsSchema,
  normalizeClipboardFilePaths,
  normalizeManualSaveInput,
  normalizeQuickAddInput,
  QuickAddParamsSchema,
} from "./saves-import-input";

describe("save import input normalization", () => {
  it("combines native URI and text paths without duplicates", () => {
    const first = join(tmpdir(), "first image.png");
    const second = join(tmpdir(), "second.png");
    const firstUrl = pathToFileURL(first).href;
    expect(
      normalizeClipboardFilePaths(
        ["# Native files", firstUrl, "https://example.com/not-a-file"].join(
          "\r\n",
        ),
        [second, firstUrl, "relative.png"].join("\n"),
      ),
    ).toEqual([first, second]);
  });

  it("ignores malformed file URLs", () => {
    expect(
      normalizeClipboardFilePaths("file:///%", "file:///% /tmp/valid.png"),
    ).toEqual(["/tmp/valid.png"]);
  });

  it("trims quick-add text after boundary parsing", () => {
    const params = QuickAddParamsSchema.parse({
      url: "  https://example.com/save  ",
      note: "  A note  ",
      tags: ["Research"],
    });

    expect(normalizeQuickAddInput(params)).toEqual({
      url: "https://example.com/save",
      note: "A note",
      tags: ["Research"],
      folderId: null,
    });
  });

  it("keeps the folder a quick add files into", () => {
    const params = QuickAddParamsSchema.parse({
      url: "https://example.com/save",
      folderId: " folder-1 ",
    });

    expect(normalizeQuickAddInput(params).folderId).toBe("folder-1");
  });

  it("keeps only finite manual dimensions", () => {
    const params = CreateManualParamsSchema.parse({
      title: "Image",
      width: "1200",
      height: "invalid",
    });

    expect(normalizeManualSaveInput(params)).toEqual({
      title: "Image",
      url: null,
      note: null,
      tags: [],
      filePaths: [],
      sourceId: null,
      mediaType: undefined,
      width: 1200,
    });
  });
});
