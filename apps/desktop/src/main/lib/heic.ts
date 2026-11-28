import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const MAX_META_BOX_BYTES = 8 * 1024 * 1024;
const HEIF_IMAGE_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
]);

type HeicDisplayOperation =
  | { kind: "rotate"; quarterTurns: number }
  | { kind: "mirror"; axis: "horizontal" | "vertical" };

interface BoxHeader {
  type: string;
  size: number;
  headerSize: number;
}

interface ParsedBox extends BoxHeader {
  start: number;
  end: number;
}

/** Quick Look can successfully return a generic file icon for a valid HEIC. */
export async function decodeHeicOnMac(
  source: string | Buffer,
  width?: number,
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "pond-heic-"));
  const output = join(directory, "preview.png");
  try {
    const sourcePath = Buffer.isBuffer(source)
      ? join(directory, "source.heic")
      : source;
    if (Buffer.isBuffer(source)) await writeFile(sourcePath, source);
    const operationsPromise = readHeicDisplayOperations(source);
    const resize = width && width > 0 ? ["-Z", String(width)] : [];
    await execFileAsync(
      "/usr/bin/sips",
      ["-s", "format", "png", ...resize, sourcePath, "--out", output],
      { timeout: 30_000 },
    );
    const [decoded, operations] = await Promise.all([
      readFile(output),
      operationsPromise,
    ]);
    return await applyDisplayOperations(decoded, operations);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Returns native-decoded HEIC pixels only when macOS is both needed and available. */
export async function decodeHeicOnMacIfNeeded(
  source: string | Buffer,
  width?: number,
): Promise<Buffer | null> {
  if (process.platform !== "darwin" || !isHeicInput(source)) return null;
  return decodeHeicOnMac(source, width);
}

/** Reads the primary item's irot and imir operations; malformed metadata means no correction. */
export async function readHeicDisplayOperations(
  source: string | Buffer,
): Promise<Array<HeicDisplayOperation>> {
  try {
    const meta = Buffer.isBuffer(source)
      ? topLevelMetaBox(source)
      : await readMetaBox(source);
    return meta ? operationsFromMeta(meta) : [];
  } catch {
    return [];
  }
}

async function applyDisplayOperations(
  decoded: Buffer,
  operations: ReadonlyArray<HeicDisplayOperation>,
): Promise<Buffer> {
  let bytes = decoded;
  for (const operation of operations) {
    let image = sharp(bytes);
    if (operation.kind === "rotate") {
      const clockwise = ((4 - operation.quarterTurns) % 4) * 90;
      if (clockwise === 0) continue;
      image = image.rotate(clockwise);
    } else if (operation.axis === "horizontal") {
      image = image.flop();
    } else {
      image = image.flip();
    }
    bytes = await image.png().toBuffer();
  }
  return bytes;
}

function isHeicInput(source: string | Buffer): boolean {
  if (!Buffer.isBuffer(source)) return /\.(heic|heif)$/i.test(source);
  if (source.byteLength < 12 || source.toString("ascii", 4, 8) !== "ftyp") {
    return false;
  }
  const boxEnd = Math.min(source.readUInt32BE(0), source.byteLength);
  if (boxEnd < 12) return false;
  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    if (HEIF_IMAGE_BRANDS.has(source.toString("ascii", offset, offset + 4))) {
      return true;
    }
  }
  return false;
}

async function readMetaBox(path: string): Promise<Buffer | null> {
  const handle = await open(path, "r");
  try {
    const fileSize = (await handle.stat()).size;
    let offset = 0;
    while (offset + 8 <= fileSize) {
      const header = await readBoxHeader(handle, offset, fileSize);
      if (!header) return null;
      if (header.type === "meta") {
        const length = header.size - header.headerSize;
        if (length < 4 || length > MAX_META_BOX_BYTES) return null;
        const meta = Buffer.alloc(length);
        await handle.read(meta, 0, length, offset + header.headerSize);
        return meta;
      }
      offset += header.size;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function readBoxHeader(
  handle: Awaited<ReturnType<typeof open>>,
  offset: number,
  fileSize: number,
): Promise<BoxHeader | null> {
  const head = Buffer.alloc(16);
  const { bytesRead } = await handle.read(head, 0, 16, offset);
  if (bytesRead < 8) return null;
  return boxHeader(head, 0, fileSize - offset, bytesRead);
}

function topLevelMetaBox(data: Buffer): Buffer | null {
  const boxes = parseBoxes(data, 0, data.byteLength);
  const meta = boxes?.find((box) => box.type === "meta");
  return meta ? data.subarray(meta.start + meta.headerSize, meta.end) : null;
}

function operationsFromMeta(meta: Buffer): Array<HeicDisplayOperation> {
  const children = parseBoxes(meta, 4, meta.byteLength);
  if (!children) return [];
  const primaryBox = children.find((box) => box.type === "pitm");
  const propertiesBox = children.find((box) => box.type === "iprp");
  if (!primaryBox || !propertiesBox) return [];

  const primary = primaryItemId(payload(meta, primaryBox));
  const propertyChildren = parseBoxes(
    meta,
    propertiesBox.start + propertiesBox.headerSize,
    propertiesBox.end,
  );
  if (!propertyChildren) return [];
  const container = propertyChildren.find((box) => box.type === "ipco");
  if (!container) return [];
  const properties = parseBoxes(
    meta,
    container.start + container.headerSize,
    container.end,
  );
  if (!properties) return [];

  const associations = propertyChildren
    .filter((box) => box.type === "ipma")
    .flatMap((box) => parsePropertyAssociations(payload(meta, box)))
    .filter((entry) => entry.itemId === primary)
    .flatMap((entry) => entry.properties);
  if (associations.length === 0) return [];

  const operations: Array<HeicDisplayOperation> = [];
  for (const index of associations) {
    if (index < 1 || index > properties.length) return [];
    const operation = transformOperation(meta, properties[index - 1]);
    if (operation === "malformed") return [];
    if (operation) operations.push(operation);
  }
  return operations;
}

function transformOperation(
  meta: Buffer,
  box: ParsedBox | undefined,
): HeicDisplayOperation | "malformed" | null {
  if (!box) return null;
  const bytes = payload(meta, box);
  if (box.type === "irot") {
    if (bytes.byteLength !== 1) return "malformed";
    const quarterTurns = (bytes[0] ?? 0) & 3;
    return quarterTurns === 0 ? null : { kind: "rotate", quarterTurns };
  }
  if (box.type === "imir") {
    if (bytes.byteLength !== 1) return "malformed";
    return {
      kind: "mirror",
      axis: ((bytes[0] ?? 0) & 1) === 1 ? "horizontal" : "vertical",
    };
  }
  return null;
}

function primaryItemId(bytes: Buffer): number | null {
  if (bytes.byteLength < 6) return null;
  const version = bytes[0];
  if (version === 0) return bytes.readUInt16BE(4);
  if (version === 1 && bytes.byteLength >= 8) return bytes.readUInt32BE(4);
  return null;
}

function parsePropertyAssociations(bytes: Buffer): Array<{
  itemId: number;
  properties: Array<number>;
}> {
  if (bytes.byteLength < 8) return [];
  const version = bytes[0] ?? 0;
  if (version > 1) return [];
  const flags = bytes.readUIntBE(1, 3);
  const wide = (flags & 1) === 1;
  const entryCount = bytes.readUInt32BE(4);
  let offset = 8;
  const entries: Array<{ itemId: number; properties: Array<number> }> = [];
  for (let entry = 0; entry < entryCount; entry += 1) {
    const idBytes = version === 0 ? 2 : 4;
    if (offset + idBytes + 1 > bytes.byteLength) return [];
    const itemId =
      version === 0 ? bytes.readUInt16BE(offset) : bytes.readUInt32BE(offset);
    offset += idBytes;
    const count = bytes[offset] ?? 0;
    offset += 1;
    const properties: Array<number> = [];
    for (let index = 0; index < count; index += 1) {
      if (wide) {
        if (offset + 2 > bytes.byteLength) return [];
        properties.push(bytes.readUInt16BE(offset) & 0x7f_ff);
        offset += 2;
      } else {
        if (offset + 1 > bytes.byteLength) return [];
        properties.push((bytes[offset] ?? 0) & 0x7f);
        offset += 1;
      }
    }
    entries.push({ itemId, properties });
  }
  return entries;
}

function payload(meta: Buffer, box: ParsedBox): Buffer {
  return meta.subarray(box.start + box.headerSize, box.end);
}

function parseBoxes(
  data: Buffer,
  start: number,
  end: number,
): Array<ParsedBox> | null {
  const boxes: Array<ParsedBox> = [];
  let offset = start;
  while (offset + 8 <= end) {
    const header = boxHeader(data, offset, end - offset, end - offset);
    if (!header) return null;
    boxes.push({ ...header, start: offset, end: offset + header.size });
    offset += header.size;
  }
  return boxes;
}

function boxHeader(
  data: Buffer,
  offset: number,
  available: number,
  readable: number,
): BoxHeader | null {
  if (readable < 8) return null;
  let size = data.readUInt32BE(offset);
  const type = data.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;
  if (size === 1) {
    if (readable < 16) return null;
    const large = data.readBigUInt64BE(offset + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    headerSize = 16;
  } else if (size === 0) {
    size = available;
  }
  if (size < headerSize || size > available) return null;
  return { type, size, headerSize };
}
