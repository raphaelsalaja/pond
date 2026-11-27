import { describe, expect, it } from "vitest";
import {
  canonicalCaptureUrl,
  capture,
  captureToCollections,
} from "./intercept";
import type { PondMessage } from "./types";

function recorder() {
  const urls: Array<string> = [];
  const send = (message: PondMessage) => {
    if (message.kind === "capture") {
      urls.push(message.payload.url);
    }
  };
  return { urls, send };
}

describe("canonicalCaptureUrl", () => {
  it.each([
    ["https://www.instagram.com/reel/ABC123/", "instagram.com/p/ABC123"],
    ["https://instagram.com/p/ABC123/?img_index=2", "instagram.com/p/ABC123"],
    ["https://www.instagram.com/tv/ABC123", "instagram.com/p/ABC123"],
    ["https://www.threads.com/t/XYZ/", "threads.com/t/XYZ"],
    [
      "https://www.reddit.com/r/a/comments/b1/c/",
      "reddit.com/r/a/comments/b1/c",
    ],
  ])("maps %s to %s", (url, key) => {
    expect(canonicalCaptureUrl(url)).toBe(key);
  });
});

describe("capture", () => {
  it("sends one save when the click hook and the interceptor both report it", () => {
    const { urls, send } = recorder();
    capture(
      "https://www.instagram.com/reel/DUP1/",
      "instagram:save",
      1000,
      send,
    );
    capture(
      "https://www.instagram.com/p/DUP1/",
      "instagram:graphql-save",
      2500,
      send,
    );
    expect(urls).toEqual(["https://www.instagram.com/reel/DUP1/"]);
  });

  it("keeps a like and a save of one post apart", () => {
    const { urls, send } = recorder();
    capture("https://www.instagram.com/p/BOTH/", "instagram:like", 1000, send);
    capture("https://www.instagram.com/p/BOTH/", "instagram:save", 1100, send);
    expect(urls).toHaveLength(2);
  });

  it("sends the same save again once the window has passed", () => {
    const { urls, send } = recorder();
    capture("https://www.threads.com/t/AGAIN", "threads:save", 1000, send);
    capture("https://www.threads.com/t/AGAIN", "threads:save", 6000, send);
    expect(urls).toHaveLength(2);
  });
});

const ELEMENT = "https://www.cosmos.so/e/123";

function payloads() {
  const sent: Array<{ url: string; collectionIds?: Array<string> }> = [];
  const send = (message: PondMessage) => {
    if (message.kind === "capture") sent.push(message.payload);
  };
  return { sent, send };
}

describe("captureToCollections", () => {
  it("sends the collections the item was added to", () => {
    const { sent, send } = payloads();
    captureToCollections(ELEMENT, "cosmos:save", ["7", "9"], 1000, send);
    expect(sent).toEqual([
      { url: ELEMENT, trigger: "cosmos:save", collectionIds: ["7", "9"] },
    ]);
  });

  it("sends an add to another collection inside the repeat window", () => {
    const { sent, send } = payloads();
    captureToCollections(ELEMENT, "cosmos:save", ["7"], 1000, send);
    captureToCollections(ELEMENT, "cosmos:save", ["9"], 1500, send);
    captureToCollections(ELEMENT, "cosmos:save", ["9"], 1600, send);
    expect(sent.map((payload) => payload.collectionIds)).toEqual([
      ["7"],
      ["9"],
    ]);
  });
});
