import { EAGLE_SUPPORTED_EXTENSIONS } from "@shared/eagle-formats";
import { classifyLibraryFile } from "@shared/file-format";
import { describe, expect, it } from "vitest";
import {
  classifyManualSave,
  keepNote,
  mediaTypeForImportedFiles,
  storageKindForImport,
} from "./manual-import";

describe("keepNote", () => {
  it("keeps leading and trailing whitespace", () => {
    expect(keepNote("  indented\n  code\n")).toBe("  indented\n  code\n");
  });

  it("treats a blank note as no note", () => {
    expect(keepNote(" \n\t")).toBeNull();
    expect(keepNote(undefined)).toBeNull();
  });
});

describe("storageKindForImport", () => {
  it("stores previewable images as image files", () => {
    expect(storageKindForImport(classifyLibraryFile("a.heic"))).toBe("image");
    expect(storageKindForImport(classifyLibraryFile("b.tiff"))).toBe("image");
    expect(storageKindForImport(classifyLibraryFile("song.m4a"))).toBe("audio");
    expect(storageKindForImport(classifyLibraryFile("paper.pdf"))).toBe(
      "document",
    );
    expect(storageKindForImport(classifyLibraryFile("face.woff2"))).toBe(
      "font",
    );
    expect(storageKindForImport(classifyLibraryFile("model.usdz"))).toBe(
      "file",
    );
    expect(storageKindForImport(classifyLibraryFile("layout.psd"))).toBe(
      "file",
    );
    expect(storageKindForImport(classifyLibraryFile("negative.cr3"))).toBe(
      "file",
    );
  });

  it.each([...EAGLE_SUPPORTED_EXTENSIONS])(
    "assigns a persistent storage role to Eagle-compatible .%s",
    (extension) => {
      expect(
        storageKindForImport(classifyLibraryFile(`asset.${extension}`)),
      ).toBeTruthy();
    },
  );
});

describe("mediaTypeForImportedFiles", () => {
  it("uses the majority type", () => {
    expect(
      mediaTypeForImportedFiles([
        classifyLibraryFile("one.mp3"),
        classifyLibraryFile("two.wav"),
        classifyLibraryFile("cover.jpg"),
      ]),
    ).toBe("audio");
  });

  it("uses a stable visual-first tie break for mixed Eagle items", () => {
    expect(
      mediaTypeForImportedFiles([
        classifyLibraryFile("paper.pdf"),
        classifyLibraryFile("cover.tiff"),
      ]),
    ).toBe("image");
  });
});

describe("classifyManualSave", () => {
  it("creates an empty text note when mediaType is text", () => {
    expect(
      classifyManualSave({
        hasFiles: false,
        hasUrl: false,
        onlyTextFiles: false,
        title: null,
        textBody: null,
        mediaType: "text",
        importedType: null,
      }),
    ).toEqual({ ok: true, isTextSave: true, mediaType: "text" });
  });

  it("rejects other empty imports", () => {
    expect(
      classifyManualSave({
        hasFiles: false,
        hasUrl: false,
        onlyTextFiles: false,
        title: null,
        textBody: null,
        importedType: null,
      }),
    ).toEqual({ ok: false, error: "empty_input" });
  });
});
