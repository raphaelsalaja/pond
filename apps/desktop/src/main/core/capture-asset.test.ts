import { describe, expect, it } from "vitest";
import { referrerFor } from "./capture-asset";

describe("referrerFor", () => {
  it("keeps the full referrer on same-origin captures", () => {
    const referrer = referrerFor(
      "https://en.wikipedia.org/wiki/Main_Page",
      "https://en.wikipedia.org/wiki/PNG",
    );
    expect(referrer).toBe("https://en.wikipedia.org/wiki/Main_Page");
  });

  it("reduces a cross-origin referrer to its origin", () => {
    // A full page URL here is what Chromium's network service cancels
    // with ERR_BLOCKED_BY_CLIENT (strict-origin-when-cross-origin).
    const referrer = referrerFor(
      "https://en.wikipedia.org/wiki/Main_Page",
      "https://upload.wikimedia.org/wikipedia/en/a/ab/Flag_of_the_United_States.png",
    );
    expect(referrer).toBe("https://en.wikipedia.org");
  });

  it("drops the referrer when a secure page references an insecure image", () => {
    const referrer = referrerFor(
      "https://x.com/status/1",
      "http://img.example.com/a.png",
    );
    expect(referrer).toBeUndefined();
  });

  it("sends the origin for a mixed cross-origin capture that stays secure", () => {
    const referrer = referrerFor(
      "http://example.com/page",
      "https://cdn.example.net/a.png",
    );
    expect(referrer).toBe("http://example.com");
  });

  it("sends no referrer when the origin is not a URL", () => {
    expect(
      referrerFor("not a url", "https://upload.wikimedia.org/x.png"),
    ).toBeUndefined();
  });
});
