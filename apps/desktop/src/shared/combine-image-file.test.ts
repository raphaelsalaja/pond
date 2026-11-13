import { describe, expect, it } from "vitest";
import { pickCombineImageFile } from "./combine-image-file";

function file(kind: string, path: string, mimeType = "image/png") {
  return { kind, path, mimeType };
}

const photo = file("image", "media-1.jpg", "image/jpeg");
const light = file("tweet_screenshot_light", "tweet-light.png");
const dark = file("tweet_screenshot_dark", "tweet-dark.png");
const quote = file("tweet_screenshot_quote1_light", "tweet-quote1-light.png");
const avatar = file("avatar", "avatar.jpg", "image/jpeg");

describe("pickCombineImageFile", () => {
  it("uses the post media when Post Cover is media, even if a card PNG is first", () => {
    expect(
      pickCombineImageFile([light, dark, photo], { tweetCover: "media" })?.path,
    ).toBe("media-1.jpg");
  });

  it("does not substitute the author avatar that lands in front after the cards are rewritten", () => {
    expect(
      pickCombineImageFile([avatar, photo, light, dark], {
        tweetCover: "media",
        theme: "light",
      })?.path,
    ).toBe("media-1.jpg");
  });

  it("does not substitute a quoted post's card that lands in front of the selected post", () => {
    expect(
      pickCombineImageFile([quote, avatar, photo, light, dark], {
        tweetCover: "media",
        theme: "dark",
      })?.path,
    ).toBe("media-1.jpg");
  });

  it("uses the theme-matched card for a text-only post when Post Cover is media", () => {
    expect(
      pickCombineImageFile([light, dark], {
        tweetCover: "media",
        theme: "dark",
      })?.path,
    ).toBe("tweet-dark.png");
  });

  it("uses the theme-matched card when Post Cover is screenshot", () => {
    expect(
      pickCombineImageFile([photo, light, dark], {
        tweetCover: "screenshot",
        theme: "dark",
      })?.path,
    ).toBe("tweet-dark.png");
  });

  it("keeps the first image of a save that is not a post", () => {
    const local = file("image", "photo.png");
    expect(pickCombineImageFile([local], { tweetCover: "media" })?.path).toBe(
      "photo.png",
    );
  });
});
