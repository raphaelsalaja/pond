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

async function respondMissing() {
  return htmlResponse("", 404);
}

async function respondMarkdown() {
  return new Response("# Design Principles\n\nSome **bold** text.", {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}

async function respondPlainMarkdown() {
  return new Response("# Readme", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function respondPlainText() {
  return new Response("line one\nline <two>", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

describe("fetchHtml", () => {
  it("returns the page markup when the request succeeds", async () => {
    await expect(
      fetchHtml("https://example.com/", async () => htmlResponse("<html/>")),
    ).resolves.toEqual({ html: "<html/>" });
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

    await expect(
      fetchHtml("https://example.com/", respondMissing),
    ).rejects.toThrow("web fetch 404");
    await expect(
      fetchHtml("https://example.com/", respondMissing),
    ).rejects.not.toThrow("web fetch failed");
  });

  it("converts a markdown document instead of rejecting it", async () => {
    const result = await fetchHtml(
      "https://vercel.com/design.md",
      respondMarkdown,
    );
    expect(result?.document?.format).toBe("markdown");
    expect(result?.document?.title).toBe("Design Principles");
    expect(result?.document?.bodyHtml).toContain("<h1>");
    expect(result?.document?.bodyHtml).toContain("<strong>bold</strong>");
    expect(result?.html).toContain("<title>Design Principles</title>");
  });

  it("parses markdown served as plain text when the URL names it", async () => {
    const result = await fetchHtml(
      "https://example.com/readme.md",
      respondPlainMarkdown,
    );
    expect(result?.document?.format).toBe("markdown");
  });

  it("wraps plain text in a pre block and titles it from the filename", async () => {
    const result = await fetchHtml(
      "https://example.com/llms.txt",
      respondPlainText,
    );
    expect(result?.document?.format).toBe("plain");
    expect(result?.document?.title).toBe("llms");
    expect(result?.document?.bodyHtml).toBe(
      "<pre>line one\nline &lt;two&gt;</pre>",
    );
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
