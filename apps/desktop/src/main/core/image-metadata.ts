import sharp from "sharp";

export interface ImageMetadata {
  width?: number;
  height?: number;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  colorSpace?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  focalLength?: number;
  aperture?: number;
  exposureTime?: string;
  iso?: number;
  takenAt?: Date;
}

interface TiffReader {
  bytes: Buffer;
  base: number;
  littleEndian: boolean;
}

type ExifValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | null;

function typeSize(type: number): number | null {
  if (type === 1 || type === 2 || type === 7) return 1;
  if (type === 3) return 2;
  if (type === 4 || type === 9) return 4;
  if (type === 5 || type === 10) return 8;
  return null;
}

function uint16(reader: TiffReader, offset: number): number {
  return reader.littleEndian
    ? reader.bytes.readUInt16LE(offset)
    : reader.bytes.readUInt16BE(offset);
}

function uint32(reader: TiffReader, offset: number): number {
  return reader.littleEndian
    ? reader.bytes.readUInt32LE(offset)
    : reader.bytes.readUInt32BE(offset);
}

function int32(reader: TiffReader, offset: number): number {
  return reader.littleEndian
    ? reader.bytes.readInt32LE(offset)
    : reader.bytes.readInt32BE(offset);
}

function valueOffset(
  reader: TiffReader,
  entry: number,
  type: number,
  count: number,
): number | null {
  const size = typeSize(type);
  if (!size) return null;
  const length = size * count;
  const offset =
    length <= 4 ? entry + 8 : reader.base + uint32(reader, entry + 8);
  return offset >= 0 && offset + length <= reader.bytes.length ? offset : null;
}

function entryValue(reader: TiffReader, entry: number): ExifValue {
  const type = uint16(reader, entry + 2);
  const count = uint32(reader, entry + 4);
  const offset = valueOffset(reader, entry, type, count);
  if (offset === null) {
    return null;
  }
  if (type === 2) {
    return {
      kind: "text",
      value: reader.bytes
        .toString("utf8", offset, offset + count)
        .replace(/\0+$/, "")
        .trim(),
    };
  }
  if (type === 3) {
    return { kind: "number", value: uint16(reader, offset) };
  }
  if (type === 4) {
    return { kind: "number", value: uint32(reader, offset) };
  }
  if (type === 9) {
    return { kind: "number", value: int32(reader, offset) };
  }
  if (type === 5) {
    const denominator = uint32(reader, offset + 4);
    return denominator
      ? { kind: "number", value: uint32(reader, offset) / denominator }
      : null;
  }
  if (type === 10) {
    const denominator = int32(reader, offset + 4);
    return denominator
      ? { kind: "number", value: int32(reader, offset) / denominator }
      : null;
  }
  return null;
}

function readIfd(
  reader: TiffReader,
  relativeOffset: number,
): Map<number, { entry: number; value: ExifValue }> {
  const fields = new Map<number, { entry: number; value: ExifValue }>();
  const start = reader.base + relativeOffset;
  if (start < 0 || start + 2 > reader.bytes.length) return fields;
  const count = uint16(reader, start);
  for (let index = 0; index < count; index += 1) {
    const entry = start + 2 + index * 12;
    if (entry + 12 > reader.bytes.length) break;
    fields.set(uint16(reader, entry), {
      entry,
      value: entryValue(reader, entry),
    });
  }
  return fields;
}

function exifDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    value,
  );
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function text(
  fields: Map<number, { value: ExifValue }>,
  tag: number,
): string | undefined {
  const value = fields.get(tag)?.value;
  return value?.kind === "text" && value.value ? value.value : undefined;
}

function number(
  fields: Map<number, { value: ExifValue }>,
  tag: number,
): number | undefined {
  const value = fields.get(tag)?.value;
  return value?.kind === "number" && Number.isFinite(value.value)
    ? value.value
    : undefined;
}

export function parseExif(exif: Buffer | undefined): ImageMetadata {
  if (!exif || exif.length < 14) return {};
  const base = exif.toString("ascii", 0, 6) === "Exif\u0000\u0000" ? 6 : 0;
  const order = exif.toString("ascii", base, base + 2);
  if (order !== "II" && order !== "MM") return {};
  const reader: TiffReader = {
    bytes: exif,
    base,
    littleEndian: order === "II",
  };
  if (uint16(reader, base + 2) !== 42) return {};
  const primary = readIfd(reader, uint32(reader, base + 4));
  const exifPointer = number(primary, 0x87_69);
  const details = exifPointer
    ? readIfd(reader, exifPointer)
    : new Map<number, { entry: number; value: ExifValue }>();
  const exposure = number(details, 0x82_9a);
  const colorCode = number(details, 0xa0_01);
  return {
    cameraMake: text(primary, 0x01_0f),
    cameraModel: text(primary, 0x01_10),
    lensModel: text(details, 0xa4_34),
    focalLength: number(details, 0x92_0a),
    aperture: number(details, 0x82_9d),
    exposureTime:
      exposure && exposure > 0
        ? exposure < 1
          ? `1/${Math.round(1 / exposure)}`
          : `${exposure}`
        : undefined,
    iso: number(details, 0x88_27),
    takenAt:
      exifDate(text(details, 0x90_03)) ?? exifDate(text(primary, 0x01_32)),
    colorSpace:
      colorCode === 1
        ? "sRGB"
        : colorCode === 0xff_ff
          ? "Uncalibrated"
          : undefined,
  };
}

const PHOTOSHOP_HEADER = "Photoshop 3.0\u0000";
const IPTC_RESOURCE_ID = 0x04_04;
/** IPTC IIM caps a keyword at 64 octets. */
const MAX_KEYWORD_BYTES = 64;

/** TIFF stores raw IIM datasets; JPEG APP13 wraps them in a Photoshop 8BIM resource. */
function iimBlock(iptc: Buffer): Buffer | null {
  if (iptc[0] === 0x1c) return iptc;
  let offset =
    iptc.toString("latin1", 0, PHOTOSHOP_HEADER.length) === PHOTOSHOP_HEADER
      ? PHOTOSHOP_HEADER.length
      : 0;
  while (offset + 12 <= iptc.length) {
    if (iptc.toString("latin1", offset, offset + 4) !== "8BIM") return null;
    const id = iptc.readUInt16BE(offset + 4);
    const nameLength = iptc[offset + 6] ?? 0;
    offset += 6 + ((nameLength + 2) & ~1);
    if (offset + 4 > iptc.length) return null;
    const size = iptc.readUInt32BE(offset);
    offset += 4;
    if (offset + size > iptc.length) return null;
    if (id === IPTC_RESOURCE_ID) return iptc.subarray(offset, offset + size);
    offset += size + (size & 1);
  }
  return null;
}

function decodeKeyword(value: Buffer): string | null {
  if (value.length > MAX_KEYWORD_BYTES) return null;
  let keyword: string;
  try {
    keyword = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    keyword = value.toString("latin1");
  }
  keyword = keyword.trim();
  return keyword && !/\p{Cc}/u.test(keyword) ? keyword : null;
}

export function parseIptcKeywords(iptc: Buffer | undefined): Array<string> {
  const iim = iptc ? iimBlock(iptc) : null;
  if (!iim) return [];
  const keywords = new Set<string>();
  let offset = 0;
  while (offset + 5 <= iim.length && iim[offset] === 0x1c) {
    const length = iim.readUInt16BE(offset + 3);
    if ((length & 0x80_00) !== 0) {
      break;
    }
    const start = offset + 5;
    const end = start + length;
    if (end > iim.length) break;
    if (iim[offset + 1] === 0x02 && iim[offset + 2] === 0x19) {
      const keyword = decodeKeyword(iim.subarray(start, end));
      if (keyword) keywords.add(keyword);
    }
    offset = end;
  }
  return [...keywords];
}

export async function extractImageKeywords(
  source: string | Buffer,
): Promise<Array<string>> {
  try {
    const { iptc } = await sharp(source, {
      failOn: "none",
      pages: 1,
    }).metadata();
    return parseIptcKeywords(iptc);
  } catch {
    return [];
  }
}

export async function extractImageMetadata(
  source: string | Buffer,
): Promise<ImageMetadata> {
  try {
    const metadata = await sharp(source, {
      failOn: "none",
      pages: 1,
    }).metadata();
    const exif = parseExif(metadata.exif);
    return {
      ...exif,
      width: metadata.width,
      height: metadata.height,
      container: metadata.format,
      colorSpace:
        exif.colorSpace ??
        metadata.space ??
        (metadata.hasProfile ? "ICC" : undefined),
    };
  } catch {
    return {};
  }
}
