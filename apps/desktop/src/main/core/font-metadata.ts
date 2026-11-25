import { inflateSync } from "node:zlib";
import { readLibraryMedia } from "./storage/library-media-storage";

export interface FontMetadata {
  family: string | null;
  subfamily: string | null;
  weight: number | null;
}

export async function extractFontMetadata(
  path: string,
): Promise<FontMetadata | null> {
  try {
    return metadataFromOpenType(await readLibraryMedia(path));
  } catch {
    return null;
  }
}

export async function extractFontFamily(path: string): Promise<string | null> {
  return (await extractFontMetadata(path))?.family ?? null;
}

export function renameWithFamily(
  pattern: string,
  parts: {
    n: number;
    title: string;
    id: string;
    family: string | null;
  },
): string {
  return pattern
    .replaceAll("{n}", String(parts.n))
    .replaceAll("{title}", parts.title)
    .replaceAll("{id}", parts.id)
    .replaceAll("{family}", parts.family || parts.title);
}

export function metadataFromOpenType(bytes: Buffer): FontMetadata | null {
  if (bytes.length < 12) return null;
  const tag = bytes.toString("ascii", 0, 4);
  if (tag === "wOFF") return metadataFromWoff(bytes);
  if (tag === "wOF2") return null;
  if (tag === "ttcf") {
    if (bytes.length < 16) return null;
    return metadataFromSfnt(bytes, bytes.readUInt32BE(12));
  }
  return metadataFromSfnt(bytes, 0);
}

function metadataFromWoff(bytes: Buffer): FontMetadata | null {
  if (bytes.length < 44) return null;
  const tableCount = bytes.readUInt16BE(12);
  let names: Map<number, string> | null = null;
  let weight: number | null = null;
  for (let index = 0; index < tableCount; index += 1) {
    const record = 44 + index * 20;
    if (record + 20 > bytes.length) break;
    const tag = bytes.toString("ascii", record, record + 4);
    if (tag !== "name" && tag !== "OS/2") continue;
    const offset = bytes.readUInt32BE(record + 4);
    const compressedLength = bytes.readUInt32BE(record + 8);
    const originalLength = bytes.readUInt32BE(record + 12);
    if (offset + compressedLength > bytes.length) continue;
    const stored = bytes.subarray(offset, offset + compressedLength);
    let table: Buffer;
    try {
      table = compressedLength < originalLength ? inflateSync(stored) : stored;
    } catch {
      continue;
    }
    if (tag === "name") names = parseNameTable(table);
    if (tag === "OS/2" && table.length >= 6) weight = table.readUInt16BE(4);
  }
  const family = names?.get(16) ?? names?.get(1) ?? null;
  const subfamily = names?.get(17) ?? names?.get(2) ?? null;
  if (!family && !subfamily && weight === null) return null;
  return { family, subfamily, weight };
}

function metadataFromSfnt(bytes: Buffer, offset: number): FontMetadata | null {
  if (offset + 12 > bytes.length) return null;
  const tableCount = bytes.readUInt16BE(offset + 4);
  let names: Map<number, string> | null = null;
  let weight: number | null = null;
  for (let index = 0; index < tableCount; index += 1) {
    const record = offset + 12 + index * 16;
    if (record + 16 > bytes.length) return null;
    const tag = bytes.toString("ascii", record, record + 4);
    const start = bytes.readUInt32BE(record + 8);
    const length = bytes.readUInt32BE(record + 12);
    if (start + length > bytes.length) {
      continue;
    }
    if (tag === "name") {
      names = parseNameTable(bytes.subarray(start, start + length));
    }
    if (tag === "OS/2" && length >= 6) {
      weight = bytes.readUInt16BE(start + 4);
    }
  }
  const family = names?.get(16) ?? names?.get(1) ?? null;
  const subfamily = names?.get(17) ?? names?.get(2) ?? null;
  if (!family && !subfamily && weight === null) return null;
  return { family, subfamily, weight };
}

function parseNameTable(table: Buffer): Map<number, string> {
  const names = new Map<number, string>();
  if (table.length < 6) return names;
  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const record = 6 + index * 12;
    if (record + 12 > table.length) break;
    const platform = table.readUInt16BE(record);
    const encoding = table.readUInt16BE(record + 2);
    const nameId = table.readUInt16BE(record + 6);
    const length = table.readUInt16BE(record + 8);
    const offset = table.readUInt16BE(record + 10);
    if (![1, 2, 16, 17].includes(nameId)) continue;
    const start = stringOffset + offset;
    const end = start + length;
    if (end > table.length) continue;
    const raw = table.subarray(start, end);
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      names.set(nameId, decodeUtf16Be(raw));
      continue;
    }
    if (platform === 1 && !names.has(nameId)) {
      names.set(nameId, raw.toString("latin1"));
    }
  }
  return names;
}

function decodeUtf16Be(bytes: Buffer): string {
  const units: Array<number> = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    units.push(bytes.readUInt16BE(index));
  }
  return String.fromCharCode(...units);
}
