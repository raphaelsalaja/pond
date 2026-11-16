import type { Capture } from "@pond/schema/raw";
import { expect, it } from "vitest";
import { postProbeOf } from "./download-post";

const TWEET = "https://x.com/pond/status/1";

it("reads an image post as its images, text and author", () => {
  const capture: Capture = {
    id: "1",
    source: "twitter",
    url: TWEET,
    description: "Two photos from the lake\nmore below",
    author: { name: "Pond", handle: "pond" },
    media: [
      { url: "https://pbs.twimg.com/a.jpg", type: "image" },
      { url: "https://pbs.twimg.com/b.jpg", type: "image" },
    ],
    quoted: {
      id: "2",
      source: "twitter",
      url: "https://x.com/other/status/2",
      media: [{ url: "https://pbs.twimg.com/q.jpg", type: "image" }],
    },
  };
  expect(postProbeOf(capture, TWEET, null)).toEqual({
    kind: "post",
    url: TWEET,
    source: "twitter",
    site: "Twitter",
    title: "Two photos from the lake",
    author: "Pond",
    text: "Two photos from the lake\nmore below",
    images: ["https://pbs.twimg.com/a.jpg", "https://pbs.twimg.com/b.jpg"],
    existingSaveId: null,
  });
});

it("falls back to quoted media and keeps a text-only post without images", () => {
  const quoted: Capture = {
    id: "1",
    source: "twitter",
    url: TWEET,
    description: "Look at this",
    media: [],
    quoted: {
      id: "2",
      source: "twitter",
      url: "https://x.com/other/status/2",
      media: [{ url: "https://pbs.twimg.com/q.jpg", type: "image" }],
    },
  };
  expect(postProbeOf(quoted, TWEET, null).images).toEqual([
    "https://pbs.twimg.com/q.jpg",
  ]);
  const text: Capture = { ...quoted, quoted: undefined };
  expect(postProbeOf(text, TWEET, "save-1")).toMatchObject({
    images: [],
    title: "Look at this",
    existingSaveId: "save-1",
  });
});

it("reads a web page as its host, title and card image", () => {
  const url = "https://www.example.com/essay";
  const capture: Capture = {
    id: url,
    source: "web",
    url,
    title: "An essay about ponds",
    description: "Why still water matters.",
    media: [],
    card: { imageUrl: "https://www.example.com/cover.png" },
  };
  expect(postProbeOf(capture, url, null)).toMatchObject({
    site: "example.com",
    title: "An essay about ponds",
    author: null,
    text: "Why still water matters.",
    images: ["https://www.example.com/cover.png"],
  });
});

it("uses a video's poster as its image", () => {
  const capture: Capture = {
    id: "1",
    source: "twitter",
    url: TWEET,
    media: [
      {
        url: "https://video.twimg.com/v.mp4",
        type: "video",
        posterUrl: "https://pbs.twimg.com/poster.jpg",
      },
    ],
  };
  expect(postProbeOf(capture, TWEET, null)).toMatchObject({
    title: "Twitter",
    images: ["https://pbs.twimg.com/poster.jpg"],
  });
});
