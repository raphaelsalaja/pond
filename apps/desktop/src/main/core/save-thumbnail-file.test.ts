import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  planThumbnailRepair,
  renderThumbnail,
  thumbnailLooksLikeSource,
  thumbnailSource,
  thumbnailToRender,
} from "./save-thumbnail-file";
import {
  flatArtJpeg,
  noiseSceneJpeg,
  noiseSceneRegionJpeg,
} from "./save-thumbnail.fixtures";

const poster = { kind: "poster", path: "clip.mp4_poster.jpg" };
const generated = { kind: "thumbnail", path: "clip.mp4_thumbnail.webp" };

async function gradient(reverse: boolean) {
  const size = 64;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.round((x / (size - 1)) * 255);
      const pixel = reverse ? 255 - value : value;
      const offset = (y * size + x) * 3;
      pixels[offset] = pixel;
      pixels[offset + 1] = reverse ? pixel : 0;
      pixels[offset + 2] = reverse ? 0 : pixel;
    }
  }
  return sharp(pixels, {
    raw: { width: size, height: size, channels: 3 },
  })
    .png()
    .toBuffer();
}

describe("thumbnailToRender", () => {
  it("keeps an existing thumbnail unless forced", () => {
    expect(thumbnailToRender([poster, generated], false)).toBeUndefined();
    expect(thumbnailToRender([poster, generated], true)).toEqual(poster);
  });

  it("never replaces a thumbnail you picked", () => {
    expect(
      thumbnailToRender([poster, { ...generated, custom: true }], true),
    ).toBeUndefined();
    expect(
      thumbnailToRender(
        [poster, { kind: "thumbnail_dark", path: "d.webp", custom: true }],
        true,
      ),
    ).toBeUndefined();
  });
});

describe("thumbnail repair", () => {
  it("rebuilds a thumbnail that belongs to another image and keeps one you picked", () => {
    const image = { kind: "image", path: "media-1.jpg" };
    const poster = { kind: "poster", path: "poster-1.jpg" };
    const card = { kind: "tweet_screenshot_light", path: "tweet-light.png" };
    const thumbnail = { kind: "thumbnail", path: "media-1.jpg_thumbnail.webp" };

    expect(thumbnailSource([card, image])).toEqual(image);
    expect(thumbnailSource([card, poster])).toEqual(poster);
    expect(thumbnailSource([card])).toBeUndefined();
    expect(planThumbnailRepair([image, thumbnail], false)).toBe("rebuild");
    expect(planThumbnailRepair([image, thumbnail], true)).toBe("keep");
    expect(planThumbnailRepair([image, thumbnail], null)).toBe("keep");
    expect(planThumbnailRepair([image], null)).toBe("create");
    expect(
      planThumbnailRepair([image, { ...thumbnail, custom: true }], false),
    ).toBe("keep");
  });

  it("tells a resized copy of a photo from a different save's photo", async () => {
    const own = await gradient(false);
    const other = await gradient(true);
    const resized = await sharp(own).resize(24, 24).webp().toBuffer();

    expect(await thumbnailLooksLikeSource(resized, own)).toBe(true);
    expect(await thumbnailLooksLikeSource(other, own)).toBe(false);
  });
});

describe("thumbnail lossy comparison", () => {
  it("passes the lossy thumbnail its own renderer produced from a noise-heavy source", async () => {
    const source = await noiseSceneJpeg();
    const thumbnail = await renderThumbnail(source);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;

    expect(await thumbnailLooksLikeSource(thumbnail, source)).toBe(true);
  });

  it.each([60, 90])(
    "passes a correct thumbnail encoded at quality %i instead of 80",
    async (quality) => {
      const source = await noiseSceneJpeg();
      const drifted = await sharp(source, { failOn: "none", pages: 1 })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();

      expect(await thumbnailLooksLikeSource(drifted, source)).toBe(true);
    },
  );

  it("passes a correct thumbnail recompressed through a second lossy generation", async () => {
    const source = await noiseSceneJpeg();
    const thumbnail = await renderThumbnail(source);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;
    const recompressed = await sharp(thumbnail)
      .webp({ quality: 80 })
      .toBuffer();

    expect(await thumbnailLooksLikeSource(recompressed, source)).toBe(true);
  });

  it("rejects a thumbnail of a different image", async () => {
    const source = await noiseSceneJpeg();
    const other = await flatArtJpeg();
    const thumbnail = await renderThumbnail(other);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;

    expect(await thumbnailLooksLikeSource(thumbnail, source)).toBe(false);
  });

  it("rejects a thumbnail showing only one region of the scene", async () => {
    const source = await noiseSceneJpeg();
    const region = await noiseSceneRegionJpeg();
    const thumbnail = await renderThumbnail(region);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;

    expect(await thumbnailLooksLikeSource(thumbnail, source)).toBe(false);
  });
});

describe("renderThumbnail", () => {
  it("encodes a resized thumbnail as WebP", async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: "#336699",
      },
    })
      .jpeg()
      .toBuffer();
    const thumbnail = await renderThumbnail(source);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;
    const meta = await sharp(thumbnail).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
  });
});
