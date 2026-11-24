import { describe, expect, it } from "vitest";
import { parseExif, parseIptcKeywords } from "./image-metadata";

function writeNumberEntry(
  buffer: Buffer,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number,
) {
  buffer.writeUInt16LE(tag, offset);
  buffer.writeUInt16LE(type, offset + 2);
  buffer.writeUInt32LE(count, offset + 4);
  buffer.writeUInt32LE(value, offset + 8);
}

function writeTextEntry(
  buffer: Buffer,
  offset: number,
  tag: number,
  count: number,
  value: string,
) {
  buffer.writeUInt16LE(tag, offset);
  buffer.writeUInt16LE(2, offset + 2);
  buffer.writeUInt32LE(count, offset + 4);
  buffer.write(value, offset + 8, 4, "ascii");
}

function fixture(): Buffer {
  const buffer = Buffer.alloc(189);
  buffer.write("Exif\0\0II", 0, "ascii");
  buffer.writeUInt16LE(42, 8);
  buffer.writeUInt32LE(8, 10);
  buffer.writeUInt16LE(3, 14);
  writeNumberEntry(buffer, 16, 0x010f, 2, 6, 50);
  writeTextEntry(buffer, 28, 0x0110, 3, "R5\0");
  writeNumberEntry(buffer, 40, 0x8769, 4, 1, 56);
  buffer.write("Canon\0", 56, "ascii");
  buffer.writeUInt16LE(6, 62);
  writeNumberEntry(buffer, 64, 0xa434, 2, 5, 134);
  writeNumberEntry(buffer, 76, 0x920a, 5, 1, 159);
  writeNumberEntry(buffer, 88, 0x829d, 5, 1, 167);
  writeNumberEntry(buffer, 100, 0x829a, 5, 1, 175);
  writeNumberEntry(buffer, 112, 0x8827, 3, 1, 200);
  writeNumberEntry(buffer, 124, 0x9003, 2, 20, 139);
  buffer.write("RF24\0", 140, "ascii");
  buffer.write("2026:09:20 12:34:56\0", 145, "ascii");
  buffer.writeUInt32LE(50, 165);
  buffer.writeUInt32LE(1, 169);
  buffer.writeUInt32LE(28, 173);
  buffer.writeUInt32LE(10, 177);
  buffer.writeUInt32LE(1, 181);
  buffer.writeUInt32LE(125, 185);
  return buffer;
}

describe("parseExif", () => {
  it("normalizes camera and exposure fields", () => {
    expect(parseExif(fixture())).toMatchObject({
      cameraMake: "Canon",
      cameraModel: "R5",
      lensModel: "RF24",
      focalLength: 50,
      aperture: 2.8,
      exposureTime: "1/125",
      iso: 200,
    });
  });
});

function dataset(record: number, id: number, value: string | Buffer): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value) : value;
  const header = Buffer.from([0x1c, record, id, 0, 0]);
  header.writeUInt16BE(bytes.length, 3);
  return Buffer.concat([header, bytes]);
}

function photoshopResource(id: number, data: Buffer): Buffer {
  const header = Buffer.alloc(12);
  header.write("8BIM", 0, "latin1");
  header.writeUInt16BE(id, 4);
  header.writeUInt32BE(data.length, 8);
  const padding = Buffer.alloc(data.length & 1);
  return Buffer.concat([header, data, padding]);
}

describe("parseIptcKeywords", () => {
  const iim = Buffer.concat([
    dataset(1, 90, "\u001b%G"),
    dataset(2, 25, "Travel"),
    dataset(2, 120, "A caption that is not a keyword"),
    dataset(2, 25, "Sea"),
    dataset(2, 25, "Travel"),
  ]);

  it("reads keyword datasets from a raw TIFF IIM block", () => {
    expect(parseIptcKeywords(iim)).toEqual(["Travel", "Sea"]);
  });

  it("reads the IPTC resource out of a JPEG APP13 Photoshop block", () => {
    const app13 = Buffer.concat([
      Buffer.from("Photoshop 3.0\0", "latin1"),
      photoshopResource(0x0409, Buffer.from([0x1c, 0x02, 0x19, 0x00, 0x03])),
      photoshopResource(0x0404, iim),
    ]);
    expect(parseIptcKeywords(app13)).toEqual(["Travel", "Sea"]);
  });

  it("ignores marker bytes that are not inside an IPTC block", () => {
    const pixels = Buffer.concat([
      Buffer.from("IDAT"),
      dataset(2, 25, "Lucky"),
    ]);
    expect(parseIptcKeywords(pixels)).toEqual([]);
    expect(parseIptcKeywords(undefined)).toEqual([]);
  });

  it("drops oversized and control-character keywords", () => {
    expect(
      parseIptcKeywords(
        Buffer.concat([
          dataset(2, 25, "x".repeat(65)),
          dataset(2, 25, Buffer.from([0x41, 0x00, 0x42])),
          dataset(2, 25, "Kept"),
        ]),
      ),
    ).toEqual(["Kept"]);
  });
});
