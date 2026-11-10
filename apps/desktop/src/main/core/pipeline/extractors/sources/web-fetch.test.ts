import { afterEach, describe, expect, it, vi } from "vitest";
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

    await expect(fetchHtml("https://example.com/")).resolves.toBe("<html/>");
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
