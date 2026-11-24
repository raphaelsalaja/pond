import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalCaptureUrl, capture } from "./intercept";

interface PostedCapture {
  message: { payload: { url: string } };
}

const postMessage = vi.fn<(data: PostedCapture, origin: string) => void>();

afterEach(() => {
  postMessage.mockReset();
  vi.unstubAllGlobals();
});

function captured(): Array<string> {
  return postMessage.mock.calls.map(([data]) => data.message.payload.url);
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
    vi.stubGlobal("window", { postMessage });
    capture("https://www.instagram.com/reel/DUP1/", "instagram:save", 1000);
    capture(
      "https://www.instagram.com/p/DUP1/",
      "instagram:graphql-save",
      2500,
    );
    expect(captured()).toEqual(["https://www.instagram.com/reel/DUP1/"]);
  });

  it("keeps a like and a save of one post apart", () => {
    vi.stubGlobal("window", { postMessage });
    capture("https://www.instagram.com/p/BOTH/", "instagram:like", 1000);
    capture("https://www.instagram.com/p/BOTH/", "instagram:save", 1100);
    expect(captured()).toHaveLength(2);
  });

  it("sends the same save again once the window has passed", () => {
    vi.stubGlobal("window", { postMessage });
    capture("https://www.threads.com/t/AGAIN", "threads:save", 1000);
    capture("https://www.threads.com/t/AGAIN", "threads:save", 6000);
    expect(captured()).toHaveLength(2);
  });
});
