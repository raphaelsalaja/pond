import { storedAsRawJson } from "@pond/schema/raw-schema";
import { expect, it } from "vitest";
import { TerminalError } from "../extractors/errors";
import { collectMediaUrls, requireFetchedMedia } from "./fetch-blobs";

it("fails the task when every captured media URL is permanently unavailable", () => {
  const mediaUrl =
    "https://i.pinimg.com/originals/96/1a/da/961adaf7db83e6d449a67674731c29d5.jpg";

  expect(() =>
    requireFetchedMedia([{ url: mediaUrl, file: null, miss: "permanent" }], 1),
  ).toThrow(TerminalError);
});

const tweetWithVideo = storedAsRawJson({
  capture: {
    media: [
      { type: "image", url: "https://pbs.twimg.com/media/a.jpg" },
      {
        type: "video",
        url: "https://video.twimg.com/ext_tw_video/1/vid/720x1280/b.mp4",
      },
    ],
  },
});

it("leaves direct videos out when auto-download is off", () => {
  expect(collectMediaUrls(tweetWithVideo, { includeVideo: false })).toEqual([
    "https://pbs.twimg.com/media/a.jpg",
  ]);
});

it("collects nothing from a video-only capture when auto-download is off", () => {
  const videoOnly = storedAsRawJson({
    capture: {
      media: [
        {
          type: "video",
          url: "https://video.twimg.com/ext_tw_video/1/vid/720x1280/b.mp4",
        },
      ],
    },
  });

  expect(collectMediaUrls(videoOnly, { includeVideo: false })).toEqual([]);
});

it("includes direct videos when auto-download is on", () => {
  expect(collectMediaUrls(tweetWithVideo, { includeVideo: true })).toHaveLength(
    2,
  );
});

it("skips the author's avatar stored as tweet media", () => {
  const withAvatar = storedAsRawJson({
    capture: {
      media: [
        {
          type: "image",
          url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg?name=orig",
        },
      ],
    },
  });

  expect(collectMediaUrls(withAvatar, { includeVideo: false })).toEqual([]);
});
