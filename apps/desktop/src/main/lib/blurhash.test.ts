import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode } from "blurhash";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { encodeBlurhash } from "./blurhash";

describe("encodeBlurhash", () => {
  it("encodes a still into a string the renderer can decode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-blurhash-"));
    const path = join(dir, "red.png");
    await writeFile(
      path,
      await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 3,
          background: { r: 220, g: 40, b: 40 },
        },
      })
        .png()
        .toBuffer(),
    );

    const hash = await encodeBlurhash(path);
    expect(hash).toEqual(expect.any(String));
    expect(hash?.length).toBeGreaterThan(6);

    if (!hash) throw new Error("expected a hash");
    const pixels = decode(hash, 4, 4);
    const r = pixels[0];
    const g = pixels[1];
    const b = pixels[2];
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });
});
