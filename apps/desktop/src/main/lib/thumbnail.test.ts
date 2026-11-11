import { describe, expect, it } from "vitest";
import {
  clampThumbWidth,
  createThumbnailScheduler,
  isIsoBaseMediaHeader,
  isRasterImageHeader,
  isThumbnailable,
  thumbnailKindForExtension,
} from "./thumbnail";

describe("thumbnail formats", () => {
  it("clamps requested widths into the thumbnail range", () => {
    expect(clampThumbWidth(32)).toBe(32);
    expect(clampThumbWidth(320)).toBe(320);
  });

  it("accepts HEIC covers for native conversion", () => {
    expect(isThumbnailable(".heic")).toBe(true);
    expect(isThumbnailable(".heif")).toBe(true);
  });

  it.each([
    [".heic", "native"],
    [".heif", "native"],
    [".jxl", "sharp-or-native"],
    [".tif", "sharp-or-native"],
    [".tiff", "sharp-or-native"],
    [".pdf", "native"],
    [".otf", "native"],
    [".woff2", "native"],
    [".usdz", "native"],
    [".mp3", "native"],
  ])("chooses the preview pipeline for %s", (extension, expected) => {
    expect(thumbnailKindForExtension(extension)).toBe(expected);
  });

  it("distinguishes genuine HEIC bytes from a JPEG with a .heic suffix", () => {
    expect(
      isIsoBaseMediaHeader(
        Buffer.from([
          0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
        ]),
      ),
    ).toBe(true);
    expect(isIsoBaseMediaHeader(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(
      false,
    );
  });

  it("recognizes extensionless legacy WebP bytes", () => {
    expect(isRasterImageHeader(Buffer.from("RIFF1234WEBP", "ascii"))).toBe(
      true,
    );
  });
});

describe("thumbnail scheduler", () => {
  it("runs a waiting foreground job before a waiting background job", async () => {
    const scheduler = createThumbnailScheduler(1);
    const release = Promise.withResolvers<void>();
    const order: string[] = [];
    const first = scheduler.run("background", async () => {
      order.push("active-background");
      await release.promise;
    });
    const second = scheduler.run("background", async () => {
      order.push("queued-background");
    });
    const foreground = scheduler.run("foreground", async () => {
      order.push("foreground");
    });

    release.resolve();
    await Promise.all([first, second, foreground]);

    expect(order).toEqual([
      "active-background",
      "foreground",
      "queued-background",
    ]);
  });

  it("allows two background transforms without occupying every foreground slot", async () => {
    const scheduler = createThumbnailScheduler(4);
    let activeBackground = 0;
    let peakBackground = 0;
    const job = () =>
      scheduler.run("background", async () => {
        activeBackground += 1;
        peakBackground = Math.max(peakBackground, activeBackground);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeBackground -= 1;
      });

    await Promise.all([job(), job(), job()]);

    expect(peakBackground).toBe(2);
  });

  it("runs visible cards after foreground work, newest first, ahead of background", async () => {
    const scheduler = createThumbnailScheduler(1);
    const release = Promise.withResolvers<void>();
    const order: string[] = [];
    const record = (label: string) => async () => {
      order.push(label);
    };
    const first = scheduler.run("foreground", async () => {
      await release.promise;
    });
    const queued = [
      scheduler.run("background", record("background")),
      scheduler.run("visible", record("scrolled-past")),
      scheduler.run("visible", record("on-screen")),
      scheduler.run("foreground", record("opened")),
    ];

    release.resolve();
    await Promise.all([first, ...queued]);

    expect(order).toEqual([
      "opened",
      "on-screen",
      "scrolled-past",
      "background",
    ]);
  });

  it("gives visible cards every slot the background limit holds back", async () => {
    const scheduler = createThumbnailScheduler(4);
    let activeVisible = 0;
    let peakVisible = 0;
    const job = () =>
      scheduler.run("visible", async () => {
        activeVisible += 1;
        peakVisible = Math.max(peakVisible, activeVisible);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeVisible -= 1;
      });

    await Promise.all([job(), job(), job(), job()]);

    expect(peakVisible).toBe(4);
  });
});
