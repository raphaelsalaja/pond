import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors";
import { fetchHtml } from "./web-fetch";

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function networkError(code: string) {
  const cause = Object.assign(new Error(code), { code });
  return Object.assign(new TypeError("fetch failed"), { cause });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHtml", () => {
  it("returns the page markup when the request succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<html/>")));

    await expect(fetchHtml("https://example.com/")).resolves.toEqual({
      html: "<html/>",
    });
  });

  it("reports no html on a bot wall so the caller can render the page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("", 403)));

    await expect(fetchHtml("https://example.com/")).resolves.toBeNull();
  });

  it("reports no html when the response headers exceed the client limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(networkError("UND_ERR_HEADERS_OVERFLOW")),
    );

    // YouTube sends more than undici's 16 KiB of headers; a browser does not.
    await expect(
      fetchHtml("https://www.youtube.com/@XanderGouws"),
    ).resolves.toBeNull();
  });

  it("keeps other network failures transient and names the cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(networkError("ECONNRESET")),
    );

    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      "web fetch failed: fetch failed (ECONNRESET)",
    );
  });

  it("defers a 429 as rate limited with the response retry-after", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 429,
          headers: { "retry-after": "60" },
        }),
      ),
    );

    const error = await fetchHtml("https://example.com/").catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfterSec).toBe(60);
    expect(error.message).toContain("web fetch 429");
  });

  it("parses a retry-after HTTP date into seconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 429,
          headers: {
            "retry-after": new Date(Date.now() + 120_000).toUTCString(),
          },
        }),
      ),
    );

    const error = await fetchHtml("https://example.com/").catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfterSec).toBeGreaterThan(100);
    expect(error.retryAfterSec).toBeLessThanOrEqual(120);
  });

  it("defers a 429 without a retry-after header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 429 })),
    );

    const error = await fetchHtml("https://example.com/").catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfterSec).toBeUndefined();
  });

  it("treats a server error as transient and a missing page as terminal", async () => {
    const stub = vi.fn().mockResolvedValue(htmlResponse("", 503));
    vi.stubGlobal("fetch", stub);
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      "web fetch 503",
    );

    stub.mockResolvedValue(htmlResponse("", 404));
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      "web fetch 404",
    );
    await expect(fetchHtml("https://example.com/")).rejects.not.toThrow(
      "web fetch failed",
    );
  });

  it("converts a markdown document instead of rejecting it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("# Design Principles\n\nSome **bold** text.", {
          status: 200,
          headers: { "content-type": "text/markdown; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchHtml("https://vercel.com/design.md");
    expect(result?.document?.format).toBe("markdown");
    expect(result?.document?.title).toBe("Design Principles");
    expect(result?.document?.bodyHtml).toContain("<h1>");
    expect(result?.document?.bodyHtml).toContain("<strong>bold</strong>");
    expect(result?.html).toContain("<title>Design Principles</title>");
  });

  it("parses markdown served as plain text when the URL names it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("# Readme", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchHtml("https://example.com/readme.md");
    expect(result?.document?.format).toBe("markdown");
  });

  it("wraps plain text in a pre block and titles it from the filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("line one\nline <two>", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchHtml("https://example.com/llms.txt");
    expect(result?.document?.format).toBe("plain");
    expect(result?.document?.title).toBe("llms");
    expect(result?.document?.bodyHtml).toBe(
      "<pre>line one\nline &lt;two&gt;</pre>",
    );
  });

  it("rejects content that is not a page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchHtml("https://example.com/api")).rejects.toThrow(
      "non-html content-type",
    );
  });
});
