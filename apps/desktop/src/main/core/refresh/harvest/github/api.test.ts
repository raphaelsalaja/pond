// @vitest-environment node

import { describe, expect, it } from "vitest";
import { fetchGithubRepoCapture } from "./api";
import type { GithubGet } from "./api";

const REPO_URL = "https://github.com/vercel/next.js";
const GENERATED_PREVIEW = "https://opengraph.githubassets.com/1/vercel/next.js";

const VALID_PAGE = `<!doctype html><html><head>
<meta name="octolytics-dimension-repository_nwo" content="vercel/next.js">
<meta property="og:image" content="${GENERATED_PREVIEW}">
</head><body>
<div class="sidebarSection"><h2><span>About</span></h2>
<p class="description">The React Framework</p>
</div>
</body></html>`;

const ZERO_MEDIA_PAGE = `<!doctype html><html><head>
<meta name="octolytics-dimension-repository_nwo" content="vercel/next.js">
</head><body>
<div class="sidebarSection"><h2><span>About</span></h2>
<p class="description">The React Framework</p>
</div>
</body></html>`;

const NOT_FOUND_PAGE = `<!doctype html><html><head><title>Page not found · GitHub</title></head><body><h1>404</h1></body></html>`;

function respond(
  status: number,
  html = "",
  headers: Record<string, string> = {},
): GithubGet {
  return async () =>
    new Response(html, {
      status,
      headers,
    });
}

function capture(args: { url?: string; get: GithubGet }) {
  return fetchGithubRepoCapture({
    url: args.url ?? REPO_URL,
    sourceId: "vercel/next.js",
    get: args.get,
  });
}

describe("fetchGithubRepoCapture", () => {
  it("captures a valid repo page with its generated card", async () => {
    const result = await capture({ get: respond(200, VALID_PAGE) });
    expect(result.ok).toBe(true);
    const found = result.ok ? result.capture : null;
    expect(found?.media).toEqual([{ url: GENERATED_PREVIEW, type: "image" }]);
    expect(found?.title).toBe("vercel/next.js");
    expect(found?.description).toContain("The React Framework");
  });

  it("reports a valid page with zero media as a capture the caller must retry", async () => {
    const result = await capture({ get: respond(200, ZERO_MEDIA_PAGE) });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.capture.media : null).toEqual([]);
  });

  it("maps 404 to not_found", async () => {
    const result = await capture({ get: respond(404, NOT_FOUND_PAGE) });
    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("maps 429 to rate_limited with the parsed retry-after", async () => {
    const result = await capture({
      get: respond(429, "", { "retry-after": "120" }),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "rate_limited",
      retryAfterSec: 120,
    });
  });

  it("maps 5xx to server_error", async () => {
    const result = await capture({ get: respond(502) });
    expect(result).toMatchObject({
      ok: false,
      reason: "server_error",
      status: 502,
    });
  });

  it("maps 403 to blocked so the browser can try", async () => {
    const result = await capture({ get: respond(403) });
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("maps other 4xx to client_error", async () => {
    const result = await capture({ get: respond(410) });
    expect(result).toMatchObject({
      ok: false,
      reason: "client_error",
      status: 410,
    });
  });

  it("reports a 200 page without repo meta as no_repo", async () => {
    const result = await capture({ get: respond(200, NOT_FOUND_PAGE) });
    expect(result).toMatchObject({ ok: false, reason: "no_repo" });
  });

  it("reports a throwing fetch as fetch_failed", async () => {
    const result = await capture({
      get: async () => {
        throw new Error("network down");
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "fetch_failed" });
  });
});
