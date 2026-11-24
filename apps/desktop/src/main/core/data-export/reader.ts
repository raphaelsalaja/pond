import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import yauzl from "yauzl";

export interface ExportReader {
  paths: Array<string>;
  readText: (path: string) => Promise<string>;
  close: () => Promise<void>;
}

/** Parsers only open matched metadata files; refuse anything this big instead of buffering it. */
const MAX_TEXT_BYTES = 256 * 1024 * 1024;

async function folderReader(root: string): Promise<ExportReader> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"),
    );
  return {
    paths,
    readText: async (path) => {
      const file = join(root, ...path.split("/"));
      if ((await stat(file)).size > MAX_TEXT_BYTES) {
        throw new Error("too_large");
      }
      return readFile(file, "utf8");
    },
    close: async () => {},
  };
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    );
  });
}

function readEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  const byPath = new Map<string, yauzl.Entry>();
  return new Promise((resolve, reject) => {
    zip.on("entry", (entry: yauzl.Entry) => {
      if (!entry.fileName.endsWith("/")) {
        byPath.set(entry.fileName, entry);
      }
      zip.readEntry();
    });
    zip.once("end", () => resolve(byPath));
    zip.once("error", reject);
    zip.readEntry();
  });
}

function readEntryText(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        return reject(error);
      }
      const chunks: Array<Buffer> = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.once("error", reject);
    });
  });
}

async function zipReader(path: string): Promise<ExportReader> {
  const zip = await openZip(path);
  let byPath: Map<string, yauzl.Entry>;
  try {
    byPath = await readEntries(zip);
  } catch (error) {
    zip.close();
    throw error;
  }
  return {
    paths: [...byPath.keys()],
    readText: async (name) => {
      const entry = byPath.get(name);
      if (!entry) {
        throw new Error("missing");
      }
      if (entry.uncompressedSize > MAX_TEXT_BYTES) {
        throw new Error("too_large");
      }
      return readEntryText(zip, entry);
    },
    close: async () => zip.close(),
  };
}

export async function openExportReader(path: string): Promise<ExportReader> {
  return (await stat(path)).isDirectory()
    ? folderReader(path)
    : zipReader(path);
}
