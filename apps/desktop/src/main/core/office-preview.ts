import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const OFFICE_EXTENSIONS = new Set([
  ".docx",
  ".pptx",
  ".xlsx",
  ".dotx",
  ".potx",
]);

const THUMBNAIL_PATHS = [
  "docProps/thumbnail.jpeg",
  "docProps/thumbnail.jpg",
  "docProps/thumbnail.png",
  "docProps/thumbnail.emf",
];

export async function extractOfficePreview(
  path: string,
): Promise<Buffer | null> {
  if (!OFFICE_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await readFile(path));
    for (const name of THUMBNAIL_PATHS) {
      const entry = zip.file(name);
      if (!entry) continue;
      const bytes = Buffer.from(await entry.async("nodebuffer"));
      if (isJpegOrPng(bytes)) return bytes;
    }
    return null;
  } catch {
    return null;
  }
}

function isJpegOrPng(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}
