import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { decodeHeicOnMac, readHeicDisplayOperations } from "./heic";

/** Sharp's cache holds input files open, which blocks temp cleanup on Windows. */
sharp.cache(false);

const fixture = fileURLToPath(
  new URL("../../../test/fixtures/portrait.heic", import.meta.url),
);
const quadrantFixture = fileURLToPath(
  new URL("../../../test/fixtures/quadrant.heic", import.meta.url),
);

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      }),
    ),
  );
});

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-heic-test-"));
  roots.push(root);
  return root;
}

async function writeQuadrant(
  rotation: number | "missing" | "malformed",
): Promise<string> {
  const root = await makeTempDir();
  const bytes = await readFile(quadrantFixture);
  const type = bytes.indexOf(Buffer.from("irot"));
  expect(type).toBeGreaterThan(0);
  if (rotation !== "missing" && rotation !== "malformed") {
    bytes[type + 4] = rotation;
  } else if (rotation === "missing") {
    bytes.write("xrot", type, "ascii");
    const associations = Buffer.from([
      0x01, 0x06, 0x81, 0x02, 0x03, 0x05, 0x86, 0x84,
    ]);
    const association = bytes.indexOf(associations);
    expect(association).toBeGreaterThan(0);
    bytes[association + associations.length - 1] = 0x04;
  } else {
    bytes.writeUInt32BE(8, type - 4);
  }
  const path = join(root, `quadrant-${rotation}.heic`);
  await writeFile(path, bytes);
  return path;
}

type Rgb = readonly [red: number, green: number, blue: number];

interface DecodedPixels {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function decodePixels(bytes: Buffer): Promise<DecodedPixels> {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function pixelAt(image: DecodedPixels, x: number, y: number): Rgb {
  const offset = (y * image.width + x) * image.channels;
  return [
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
  ];
}

function expectPixelNear(actual: Rgb, expected: Rgb): void {
  for (const channel of [0, 1, 2] as const) {
    expect(Math.abs((actual[channel] ?? 0) - expected[channel])).toBeLessThan(
      40,
    );
  }
}

function expectQuadrants(
  image: DecodedPixels,
  corners: { topLeft: Rgb; topRight: Rgb; bottomLeft: Rgb; bottomRight: Rgb },
): void {
  const left = Math.floor(image.width / 4);
  const right = Math.floor((image.width * 3) / 4);
  const top = Math.floor(image.height / 4);
  const bottom = Math.floor((image.height * 3) / 4);
  expectPixelNear(pixelAt(image, left, top), corners.topLeft);
  expectPixelNear(pixelAt(image, right, top), corners.topRight);
  expectPixelNear(pixelAt(image, left, bottom), corners.bottomLeft);
  expectPixelNear(pixelAt(image, right, bottom), corners.bottomRight);
}

function box(type: string, payload: Buffer): Buffer {
  const out = Buffer.alloc(8 + payload.byteLength);
  out.writeUInt32BE(out.byteLength, 0);
  out.write(type, 4, "ascii");
  payload.copy(out, 8);
  return out;
}

function syntheticTransformMetadata(): Buffer {
  const pitm = box("pitm", Buffer.from([0, 0, 0, 0, 0, 1]));
  const ipco = box(
    "ipco",
    Buffer.concat([
      box("irot", Buffer.from([0])),
      box("irot", Buffer.from([3])),
      box("imir", Buffer.from([1])),
    ]),
  );
  const ipma = box(
    "ipma",
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 2, 0x82, 0x83]),
  );
  const iprp = box("iprp", Buffer.concat([ipco, ipma]));
  const meta = box("meta", Buffer.concat([Buffer.alloc(4), pitm, iprp]));
  return Buffer.concat([
    box("ftyp", Buffer.from("heic\0\0\0\0", "ascii")),
    meta,
  ]);
}

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;
const YELLOW = [255, 255, 0] as const;

describe("HEIC display transform parsing", () => {
  it("reads the primary image rotation and ignores malformed boxes", async () => {
    const rotated = await readFile(quadrantFixture);
    const type = rotated.indexOf(Buffer.from("irot"));
    rotated[type + 4] = 3;
    await expect(readHeicDisplayOperations(rotated)).resolves.toEqual([
      { kind: "rotate", quarterTurns: 3 },
    ]);

    const malformed = Buffer.from(rotated);
    malformed.writeUInt32BE(8, type - 4);
    await expect(readHeicDisplayOperations(malformed)).resolves.toEqual([]);
    await expect(
      readHeicDisplayOperations(Buffer.from("not heic")),
    ).resolves.toEqual([]);
  });

  it("uses the primary item association when properties repeat", async () => {
    await expect(
      readHeicDisplayOperations(syntheticTransformMetadata()),
    ).resolves.toEqual([
      { kind: "rotate", quarterTurns: 3 },
      { kind: "mirror", axis: "horizontal" },
    ]);
  });
});

describe.skipIf(process.platform !== "darwin")("macOS HEIC decoding", () => {
  it("decodes photo pixels instead of a file icon and preserves portrait proportions", async () => {
    const decoded = await decodeHeicOnMac(fixture, 64);
    const image = await decodePixels(decoded);
    expect(image.width).toBe(32);
    expect(image.height).toBe(64);
    const [red, green, blue] = pixelAt(image, 0, 0);
    expect(red).toBeGreaterThan(180);
    expect(green).toBeLessThan(70);
    expect(blue).toBeLessThan(80);
  });

  it.each([
    [
      1,
      { width: 64, height: 32 },
      { topLeft: GREEN, topRight: YELLOW, bottomLeft: RED, bottomRight: BLUE },
    ],
    [
      2,
      { width: 32, height: 64 },
      { topLeft: YELLOW, topRight: BLUE, bottomLeft: GREEN, bottomRight: RED },
    ],
    [
      3,
      { width: 64, height: 32 },
      { topLeft: BLUE, topRight: RED, bottomLeft: YELLOW, bottomRight: GREEN },
    ],
  ] as const)(
    "applies irot rotation %i in display order",
    async (rotation, dimensions, corners) => {
      const source = await writeQuadrant(rotation);
      const before = await readFile(source);
      const decoded = await decodeHeicOnMac(source, 64);
      const image = await decodePixels(decoded);
      expect({ width: image.width, height: image.height }).toEqual(dimensions);
      expectQuadrants(image, corners);
      expect(await readFile(source)).toEqual(before);
    },
  );

  it("leaves irot zero and missing irot pixels unrotated", async () => {
    for (const rotation of [0, "missing"] as const) {
      const source = await writeQuadrant(rotation);
      const decoded = await decodeHeicOnMac(source, 64);
      const image = await decodePixels(decoded);
      expect({ width: image.width, height: image.height }).toEqual({
        width: 32,
        height: 64,
      });
      expectQuadrants(image, {
        topLeft: RED,
        topRight: GREEN,
        bottomLeft: BLUE,
        bottomRight: YELLOW,
      });
    }
  });

  it("rejects unreadable sources instead of returning an icon", async () => {
    await expect(decodeHeicOnMac(`${fixture}.missing`, 64)).rejects.toThrow();
  });
});
