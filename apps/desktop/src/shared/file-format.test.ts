import { describe, expect, it } from "vitest";
import { EAGLE_SUPPORTED_EXTENSIONS } from "./eagle-formats";
import {
  canDestructivelyEditImage,
  canRequestNativeThumbnail,
  classifyLibraryFile,
  classifyLibraryFileFromHeader,
  isMpegTransportStreamHeader,
  libraryFilename,
  typeLabelForPath,
} from "./file-format";

describe("canDestructivelyEditImage", () => {
  it.each(["avif", "gif", "jpeg", "jpg", "png", "tif", "tiff", "webp"])(
    "allows .%s transforms",
    (extension) => {
      expect(canDestructivelyEditImage(`/Library/PHOTO.${extension}`)).toBe(
        true,
      );
    },
  );

  it.each(["heic", "jxl", "dng", "cr3", "psd", "svg", "unknown"])(
    "rejects .%s transforms",
    (extension) => {
      expect(canDestructivelyEditImage(`asset.${extension}`)).toBe(false);
    },
  );
});

describe("classifyLibraryFile", () => {
  it("distinguishes MPEG transport streams from TypeScript with the same extension", () => {
    const transportStream = Buffer.alloc(188 * 3);
    transportStream[0] = 0x47;
    transportStream[188] = 0x47;
    transportStream[376] = 0x47;

    expect(isMpegTransportStreamHeader(transportStream)).toBe(true);
    expect(
      classifyLibraryFileFromHeader("clip.ts", "video/mp2t", transportStream),
    ).toMatchObject({
      mediaType: "video",
      previewKind: "video",
      mimeType: "video/mp2t",
    });
    expect(
      classifyLibraryFileFromHeader(
        "source.ts",
        "video/mp2t",
        Buffer.from("export const answer = 42;", "utf8"),
      ),
    ).toMatchObject({
      mediaType: "text",
      previewKind: "text",
      mimeType: "text/typescript",
    });
    expect(classifyLibraryFile("clip.ts", "video/mp2t")).toMatchObject({
      mediaType: "video",
      previewKind: "video",
      mimeType: "video/mp2t",
    });
    expect(classifyLibraryFile("source.ts")).toMatchObject({
      mediaType: "text",
      previewKind: "text",
      mimeType: "text/typescript",
    });
  });

  it.each([
    ["photo.jpg", "image", "direct-image", "image/jpeg"],
    ["photo.jfif", "image", "direct-image", "image/jpeg"],
    ["photo.HEIC", "image", "native-image", "image/heic"],
    ["photo.jxl", "image", "native-image", "image/jxl"],
    ["scan.tiff", "image", "native-image", "image/tiff"],
    ["movie.mp4", "video", "video", "video/mp4"],
    ["recording.mp3", "audio", "audio", "audio/mpeg"],
    ["recording.wav", "audio", "audio", "audio/wav"],
    ["recording.m4a", "audio", "audio", "audio/mp4"],
    ["paper.pdf", "document", "pdf", "application/pdf"],
    ["family.otf", "font", "font", "font/otf"],
    ["family.woff2", "font", "font", "font/woff2"],
    ["family.ttc", "font", "font", "font/collection"],
    ["notes.md", "text", "text", "text/markdown"],
    ["styles.css", "text", "text", "text/css"],
    ["source.java", "text", "text", "text/x-java-source"],
    ["script.js", "text", "text", "text/javascript"],
    ["script.py", "text", "text", "text/x-python"],
    ["source.rs", "text", "text", "text/x-rust"],
    ["query.sql", "text", "text", "application/sql"],
    ["source.ts", "text", "text", "text/typescript"],
    ["data.json", "text", "text", "application/json"],
    ["motion.lottie", "file", "generic", "application/zip+dotlottie"],
    ["photo.livp", "image", "generic", "application/zip+live-photo"],
    ["motion.pag", "file", "generic", "application/x-pag"],
    ["motion.svga", "file", "generic", "application/x-svga"],
    ["layout.psd", "image", "generic", "image/vnd.adobe.photoshop"],
    ["negative.cr3", "image", "generic", "image/x-canon-cr3"],
    [
      "report.docx",
      "document",
      "generic",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["scene.glb", "file", "generic", "model/gltf-binary"],
    ["scene.gltf", "file", "generic", "model/gltf+json"],
    ["scene.amf", "file", "generic", "application/x-amf"],
    ["scene.usdc", "file", "generic", "model/vnd.usd"],
    ["scene.vtk", "file", "generic", "model/vnd.vtk"],
    ["movie.mpeg", "video", "generic", "video/mpeg"],
    ["book.epub", "document", "generic", "application/epub+zip"],
    ["offline.webarchive", "file", "generic", "application/x-webarchive"],
    ["model.usdz", "file", "generic", "model/vnd.usdz+zip"],
    ["archive.unknown", "file", "generic", "application/octet-stream"],
  ] as const)(
    "classifies %s as %s with a %s preview",
    (path, mediaType, previewKind, mimeType) => {
      expect(classifyLibraryFile(path)).toMatchObject({
        mediaType,
        previewKind,
        mimeType,
      });
    },
  );

  it("uses a trustworthy supplied MIME type for an unknown extension", () => {
    expect(classifyLibraryFile("asset.bin", "audio/flac")).toMatchObject({
      mediaType: "audio",
      previewKind: "audio",
      mimeType: "audio/flac",
    });
  });

  it.each([...EAGLE_SUPPORTED_EXTENSIONS])(
    "classifies Eagle-compatible .%s without an opaque MIME fallback",
    (extension) => {
      const result = classifyLibraryFile(`asset.${extension}`);
      expect(result.extension).toBe(extension);
      expect(result.mimeType).not.toBe("application/octet-stream");
    },
  );
});

describe("libraryFilename", () => {
  it("preserves a useful original filename", () => {
    expect(libraryFilename("/Inbox/My typeface.woff2")).toBe(
      "My typeface.woff2",
    );
  });

  it("removes control characters and filesystem separators", () => {
    expect(libraryFilename("unsafe\u0000/name\\part.pdf")).toBe("part.pdf");
  });

  it.each([
    ["CON.png", "_CON.png"],
    ["nul", "_nul"],
    ["Aux.tar.gz", "_Aux.tar.gz"],
    ["com1.txt", "_com1.txt"],
    ["LPT9", "_LPT9"],
    ["CON .txt", "_CON .txt"],
  ])("prefixes the Windows device name %s", (name, expected) => {
    expect(libraryFilename(name)).toBe(expected);
  });

  it.each(["console.png", "conn.png", "com10.png", "a.con", "lpt.txt"])(
    "keeps %s, which Windows accepts",
    (name) => {
      expect(libraryFilename(name)).toBe(name);
    },
  );

  it("replaces colons and trailing dots that Windows rejects", () => {
    expect(libraryFilename("a:b.png")).toBe("a_b.png");
    expect(libraryFilename("report.")).toBe("report");
    expect(libraryFilename("C:/Users/x/CON")).toBe("_CON");
  });

  it("falls back for an unusable filename", () => {
    expect(libraryFilename("...", "file.bin")).toBe("file.bin");
  });
});

describe("typeLabelForPath", () => {
  it("supports five-character extensions", () => {
    expect(typeLabelForPath("font.woff2")).toBe("WOFF2");
  });
});

describe("native thumbnails", () => {
  it.each(["recording.mp3", "paper.pdf", "family.woff2", "model.usdz"])(
    "allows %s to request an OS thumbnail",
    (path) => {
      expect(canRequestNativeThumbnail(path)).toBe(true);
    },
  );
});
