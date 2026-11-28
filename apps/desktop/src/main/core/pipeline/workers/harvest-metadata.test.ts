import type { Capture } from "@pond/schema/raw";
import { expect, it } from "vitest";
import { preserveReharvestMedia } from "./harvest-metadata";

function repoCapture(media: Array<{ url: string; type: "image" }>): Capture {
  return {
    id: "os6/x-minimal",
    source: "github",
    url: "https://github.com/os6/x-minimal",
    title: "os6/x-minimal",
    media,
  };
}

const ogCard = {
  url: "https://opengraph.githubassets.com/1/os6/x-minimal",
  type: "image" as const,
};

it("keeps the previous capture's media when a github re-harvest comes back medialess", () => {
  const stored = repoCapture([ogCard]);
  const degraded = repoCapture([]);

  const merged = preserveReharvestMedia(degraded, stored);

  expect(merged.media).toEqual([ogCard]);
  expect(merged.media).not.toBe(stored.media);
});

it("leaves a github harvest with its own media untouched", () => {
  const custom = {
    url: "https://repository-images.githubusercontent.com/70107786/4602445c",
    type: "image" as const,
  };
  const stored = repoCapture([ogCard]);
  const fresh = repoCapture([custom]);

  expect(preserveReharvestMedia(fresh, stored).media).toEqual([custom]);
});

it("does not preserve media when the re-harvest resolves to different content", () => {
  const stored = repoCapture([ogCard]);
  const renamed = { ...repoCapture([]), id: "os6/other-repo" };

  expect(preserveReharvestMedia(renamed, stored).media).toEqual([]);
});

it("does not preserve media for sources whose media can genuinely vanish", () => {
  const stored = repoCapture([ogCard]);
  const tweet: Capture = {
    id: "1234567890",
    source: "twitter",
    url: "https://x.com/a/status/1234567890",
    media: [],
  };

  expect(preserveReharvestMedia(tweet, stored).media).toEqual([]);
  expect(
    preserveReharvestMedia(tweet, { ...stored, id: "1234567890" }).media,
  ).toEqual([]);
});

it("carries the exhaustion marker through a medialess re-harvest of the same content", () => {
  const exhausted = {
    at: "2026-11-27T14:57:50.000Z",
    urls: ["https://pbs.twimg.com/media/a.jpg"],
  };
  const stored: Capture = {
    id: "1234567890",
    source: "twitter",
    url: "https://x.com/a/status/1234567890",
    media: [],
    extras: { mediaFetchExhausted: exhausted },
  };
  const reharvested: Capture = {
    id: "1234567890",
    source: "twitter",
    url: "https://x.com/a/status/1234567890",
    media: [],
  };

  const merged = preserveReharvestMedia(reharvested, stored);

  expect(merged.extras?.mediaFetchExhausted).toEqual(exhausted);
});

it("drops the exhaustion marker when the re-harvest finds media again", () => {
  const stored: Capture = {
    id: "1234567890",
    source: "twitter",
    url: "https://x.com/a/status/1234567890",
    media: [],
    extras: {
      mediaFetchExhausted: {
        at: "2026-11-27T14:57:50.000Z",
        urls: ["https://pbs.twimg.com/media/a.jpg"],
      },
    },
  };
  const reharvested: Capture = {
    id: "1234567890",
    source: "twitter",
    url: "https://x.com/a/status/1234567890",
    media: [{ url: "https://pbs.twimg.com/media/a.jpg", type: "image" }],
  };

  expect(
    preserveReharvestMedia(reharvested, stored).extras?.mediaFetchExhausted,
  ).toBeUndefined();
});
