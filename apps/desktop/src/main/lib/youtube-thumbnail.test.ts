import { storedAsRawJson } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import {
  isYoutubeAutomaticFrame,
  youtubeShortPosterPlan,
} from "./youtube-thumbnail";

const SHORT_ID = "a88WoGBL1Mc";
const LANDSCAPE = `https://i.ytimg.com/vi/${SHORT_ID}/hqdefault.jpg`;

function watchCapture(duration: number, posterUrl = LANDSCAPE) {
  return storedAsRawJson({
    capture: {
      id: SHORT_ID,
      source: "youtube",
      url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
      duration,
      media: [
        {
          type: "video",
          url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
          posterUrl,
        },
      ],
    },
  });
}

describe("youtubeShortPosterPlan", () => {
  it("tries the display covers before the automatic frame for a short watch URL", () => {
    expect(youtubeShortPosterPlan(watchCapture(39), LANDSCAPE)).toEqual({
      fallbackUrl: LANDSCAPE,
      attempts: [
        LANDSCAPE,
        `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
        `https://i.ytimg.com/vi/${SHORT_ID}/sardefault.jpg`,
        `https://i.ytimg.com/vi/${SHORT_ID}/oar2.jpg`,
        `https://i.ytimg.com/vi/${SHORT_ID}/frame0.jpg`,
      ],
    });
  });

  it("treats a /shorts/ URL as a short when the duration was not harvested", () => {
    const rawJson = storedAsRawJson({
      capture: {
        id: SHORT_ID,
        source: "youtube",
        url: `https://www.youtube.com/shorts/${SHORT_ID}`,
        media: [
          {
            type: "video",
            url: `https://www.youtube.com/shorts/${SHORT_ID}`,
            posterUrl: LANDSCAPE,
          },
        ],
      },
    });
    expect(youtubeShortPosterPlan(rawJson, LANDSCAPE)?.attempts[1]).toBe(
      `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
    );
  });

  it("leaves a longer video on its current thumbnail", () => {
    expect(youtubeShortPosterPlan(watchCapture(181), LANDSCAPE)).toBeNull();
  });

  it("keeps an automatic frame the page recorded behind the display covers", () => {
    const frame = `https://i.ytimg.com/vi/${SHORT_ID}/oar2.jpg`;
    expect(
      youtubeShortPosterPlan(watchCapture(39, frame), frame)?.attempts,
    ).toEqual([
      `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
      `https://i.ytimg.com/vi/${SHORT_ID}/sardefault.jpg`,
      frame,
      `https://i.ytimg.com/vi/${SHORT_ID}/frame0.jpg`,
    ]);
  });

  it("upgrades a recorded display cover to its full-size unsigned file", () => {
    const signed = `https://i.ytimg.com/vi/${SHORT_ID}/sardefault.jpg?sqp=-oaymwEd&rs=AOn4`;
    expect(
      youtubeShortPosterPlan(watchCapture(39, signed), signed)?.attempts.slice(
        0,
        3,
      ),
    ).toEqual([
      `https://i.ytimg.com/vi/${SHORT_ID}/sardefault.jpg`,
      signed,
      `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
    ]);
  });

  it("tries a signed portrait crop as recorded, since its bare file is the landscape composite", () => {
    const crop = `https://i.ytimg.com/vi/${SHORT_ID}/hq720.jpg?sqp=-oaymwEd&rs=AOn4`;
    expect(
      youtubeShortPosterPlan(watchCapture(39, crop), crop)?.attempts[0],
    ).toBe(crop);
  });

  it("prefers the Capture's recorded cover over the yt-dlp thumbnail", () => {
    const cover = `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg?sqp=1`;
    const ytdlp = `https://i.ytimg.com/vi/${SHORT_ID}/maxresdefault.jpg`;
    const rawJson = storedAsRawJson({
      capture: {
        id: SHORT_ID,
        source: "youtube",
        url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
        duration: 39,
        media: [
          {
            type: "video",
            url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
            posterUrl: cover,
          },
        ],
      },
      ytdlp: { thumbnail: ytdlp },
    });
    expect(
      youtubeShortPosterPlan(rawJson, ytdlp)?.attempts.slice(0, 3),
    ).toEqual([
      `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
      cover,
      ytdlp,
    ]);
  });
});

function thumb(file: string): string {
  return `https://i.ytimg.com/vi/${SHORT_ID}/${file}`;
}

describe("isYoutubeAutomaticFrame", () => {
  it("names the frames YouTube picks and not the display covers", () => {
    expect(isYoutubeAutomaticFrame(thumb("oar2.jpg"))).toBe(true);
    expect(isYoutubeAutomaticFrame(thumb("frame0.jpg"))).toBe(true);
    expect(isYoutubeAutomaticFrame(thumb("oardefault.jpg"))).toBe(false);
    expect(isYoutubeAutomaticFrame(thumb("sardefault.jpg"))).toBe(false);
    expect(isYoutubeAutomaticFrame(thumb("hq720.jpg?sqp=1"))).toBe(false);
    expect(isYoutubeAutomaticFrame("https://cdn.test/oar2.jpg")).toBe(false);
    expect(isYoutubeAutomaticFrame(undefined)).toBe(false);
  });
});
