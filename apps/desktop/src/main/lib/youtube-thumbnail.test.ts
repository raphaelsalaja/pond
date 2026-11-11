import { storedAsRawJson } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import { youtubeShortPosterPlan } from "./youtube-thumbnail";

const SHORT_ID = "a88WoGBL1Mc";
const LANDSCAPE = `https://i.ytimg.com/vi/${SHORT_ID}/hqdefault.jpg`;

function watchCapture(duration: number) {
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
          posterUrl: LANDSCAPE,
        },
      ],
    },
  });
}

describe("youtubeShortPosterPlan", () => {
  it("tries the upright files for a short watch URL, then the poster the page already had", () => {
    expect(youtubeShortPosterPlan(watchCapture(39), LANDSCAPE)).toEqual({
      fallbackUrl: LANDSCAPE,
      attempts: [
        `https://i.ytimg.com/vi/${SHORT_ID}/oar2.jpg`,
        `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
        LANDSCAPE,
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
    expect(youtubeShortPosterPlan(rawJson, LANDSCAPE)?.attempts[0]).toBe(
      `https://i.ytimg.com/vi/${SHORT_ID}/oar2.jpg`,
    );
  });

  it("leaves a longer video on its current thumbnail", () => {
    expect(youtubeShortPosterPlan(watchCapture(181), LANDSCAPE)).toBeNull();
  });

  it("lists the page poster once when that poster is already an upright file", () => {
    const upright = `https://i.ytimg.com/vi/${SHORT_ID}/oar2.jpg`;
    expect(youtubeShortPosterPlan(watchCapture(39), upright)?.attempts).toEqual(
      [
        upright,
        `https://i.ytimg.com/vi/${SHORT_ID}/oardefault.jpg`,
        `https://i.ytimg.com/vi/${SHORT_ID}/frame0.jpg`,
      ],
    );
  });
});
