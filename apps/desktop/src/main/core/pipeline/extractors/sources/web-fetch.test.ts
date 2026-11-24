import { describe, expect, it } from "vitest";
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

describe("fetchHtml", () => {
  it("returns the page markup when the request succeeds", async () => {
    await expect(
      fetchHtml("https://example.com/", async () => htmlResponse("<html/>")),
    ).resolves.toBe("<html/>");
  });

  it("reports no html on a bot wall so the caller can render the page", async () => {
    await expect(
      fetchHtml("https://example.com/", async () => htmlResponse("", 403)),
    ).resolves.toBeNull();
  });

  it("reports no html when the response headers exceed the client limit", async () => {
    /** YouTube sends more than undici's 16 KiB of headers; a browser does not. */
    await expect(
      fetchHtml("https://www.youtube.com/@XanderGouws", async () => {
        throw networkError("UND_ERR_HEADERS_OVERFLOW");
      }),
    ).resolves.toBeNull();
  });

  it("keeps other network failures transient and names the cause", async () => {
    await expect(
      fetchHtml("https://example.com/", async () => {
        throw networkError("ECONNRESET");
      }),
    ).rejects.toThrow("web fetch failed: fetch failed (ECONNRESET)");
  });

  it("treats a server error as transient and a missing page as terminal", async () => {
    await expect(
      fetchHtml("https://example.com/", async () => htmlResponse("", 503)),
    ).rejects.toThrow("web fetch 503");

    const missing = async () => htmlResponse("", 404);
    await expect(fetchHtml("https://example.com/", missing)).rejects.toThrow(
      "web fetch 404",
    );
    await expect(
      fetchHtml("https://example.com/", missing),
    ).rejects.not.toThrow("web fetch failed");
  });

  it("rejects content that is not a page", async () => {
    await expect(
      fetchHtml(
        "https://example.com/api",
        async () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    ).rejects.toThrow("non-html content-type");
  });
});
