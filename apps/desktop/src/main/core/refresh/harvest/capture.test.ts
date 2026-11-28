import type { JsonObject } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import {
  AuthRequiredError,
  CaptureIncompleteError,
  RateLimitedError,
  TerminalError,
  TransientError,
} from "../../pipeline/extractors/errors";
import type { HarvestResult, PageReadResult } from "../harvest-window/harvest";
import { captureFromSource } from "./capture";
import type { GithubGet } from "./github/api";
import type { PinterestGet } from "./pinterest/api";

const URL = "https://www.pinterest.com/pin/123/";

function relayPage(payload: JsonObject): string {
  const key = encodeURIComponent(JSON.stringify({ queryID: "q" }));
  return `<script>window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("${key}", ${JSON.stringify(payload)});</script>`;
}

function pinHtml(title: string, imageUrl: string): string {
  return relayPage({
    data: {
      v3GetPinQueryv2: {
        __typename: "PinResponse",
        data: { title, imageLargeUrl: imageUrl },
      },
    },
  });
}

const notFoundHtml = relayPage({
  data: { v3GetPinQueryv2: { __typename: "PinNotFound" } },
});

const htmlGet =
  (html: string): PinterestGet =>
  async () =>
    new Response(html);

function pinCapture(mediaUrl?: string): Capture {
  const capture: Capture = {
    id: "123",
    source: "pinterest",
    url: URL,
    media: mediaUrl ? [{ url: mediaUrl, type: "image" }] : [],
  };
  if (!mediaUrl) capture.title = "Idea pin";
  return capture;
}

function harvestOf(result: HarvestResult) {
  return async () => result;
}

const base = {
  url: URL,
  source: "pinterest" as const,
  sourceId: "123",
};

it("returns the anonymous pin when the logged-out page has media", async () => {
  const capture = await captureFromSource(base, {
    partition: "persist:test",
    anonymousGet: htmlGet(
      pinHtml("Record player", "https://i.pinimg.com/a.jpg"),
    ),
    harvest: harvestOf({ ok: false, reason: "harvest_failed" }),
  });
  expect(capture.media[0]?.url).toBe("https://i.pinimg.com/a.jpg");
});

it("harvests a pin the anonymous page marks PinNotFound", async () => {
  const capture = await captureFromSource(
    { ...base, isSignedIn: async () => false },
    {
      partition: "persist:test",
      anonymousGet: htmlGet(notFoundHtml),
      harvest: harvestOf({
        ok: true,
        capture: pinCapture("https://i.pinimg.com/session.jpg"),
      }),
    },
  );
  expect(capture.media[0]?.url).toBe("https://i.pinimg.com/session.jpg");
});

it("uses the signed-in pin page when anonymous HTML reports PinNotFound", async () => {
  const capture = await captureFromSource(
    { ...base, isSignedIn: async () => true },
    {
      partition: "persist:test",
      anonymousGet: htmlGet(notFoundHtml),
      signedGet: htmlGet(
        pinHtml("Secret pin", "https://i.pinimg.com/secret.jpg"),
      ),
      harvest: harvestOf({ ok: false, reason: "harvest_failed" }),
    },
  );
  expect(capture.media[0]?.url).toBe("https://i.pinimg.com/secret.jpg");
});

it("does not treat anonymous PinNotFound as gone while signed out", async () => {
  await expect(
    captureFromSource(
      { ...base, isSignedIn: async () => false },
      {
        partition: "persist:test",
        anonymousGet: htmlGet(notFoundHtml),
        harvest: harvestOf({ ok: false, reason: "auth_required" }),
      },
    ),
  ).rejects.toBeInstanceOf(AuthRequiredError);
});

it("does not treat a scrape timeout as a deleted pin", async () => {
  await expect(
    captureFromSource(
      { ...base, isSignedIn: async () => true },
      {
        partition: "persist:test",
        anonymousGet: htmlGet(notFoundHtml),
        signedGet: htmlGet("<html><title>Pinterest</title></html>"),
        harvest: harvestOf({ ok: false, reason: "timeout" }),
      },
    ),
  ).rejects.toBeInstanceOf(TransientError);
});

it("terminal-fails only when the signed-in pin page also reports PinNotFound", async () => {
  await expect(
    captureFromSource(
      { ...base, isSignedIn: async () => true },
      {
        partition: "persist:test",
        anonymousGet: htmlGet(notFoundHtml),
        signedGet: htmlGet(notFoundHtml),
        harvest: harvestOf({ ok: false, reason: "harvest_failed" }),
      },
    ),
  ).rejects.toThrow(new TerminalError("pinterest item no longer exists"));
});

it("keeps a pin when signed-in HTML says PinNotFound but the harvest still has media", async () => {
  const capture = await captureFromSource(
    { ...base, isSignedIn: async () => true },
    {
      partition: "persist:test",
      anonymousGet: htmlGet(notFoundHtml),
      signedGet: htmlGet(notFoundHtml),
      harvest: harvestOf({
        ok: true,
        capture: pinCapture("https://i.pinimg.com/dom.jpg"),
      }),
    },
  );
  expect(capture.media[0]?.url).toBe("https://i.pinimg.com/dom.jpg");
});

it("retries when a signed-in session cannot confirm the pin is gone", async () => {
  await expect(
    captureFromSource(
      { ...base, isSignedIn: async () => true },
      {
        partition: "persist:test",
        anonymousGet: htmlGet(notFoundHtml),
        signedGet: htmlGet("<html><title>Pinterest</title></html>"),
        harvest: harvestOf({ ok: false, reason: "harvest_failed" }),
      },
    ),
  ).rejects.toBeInstanceOf(TransientError);
});

it("retries an empty scrape instead of calling the page deleted", async () => {
  await expect(
    captureFromSource(
      {
        url: "https://www.youtube.com/watch?v=abc",
        source: "youtube",
      },
      { harvest: harvestOf({ ok: false, reason: "harvest_failed" }) },
    ),
  ).rejects.toThrow(new TransientError("scrape returned no data"));
});

it("terminal-fails a harvest the source page reports as missing", async () => {
  await expect(
    captureFromSource(
      {
        url: "https://x.com/anyuser/status/1",
        source: "twitter",
        sourceId: "1",
      },
      { harvest: harvestOf({ ok: false, reason: "not_found" }) },
    ),
  ).rejects.toThrow(new TerminalError("page not found or no longer exists"));
});

const GITHUB_URL = "https://github.com/vercel/next.js";
const GITHUB_CARD = "https://opengraph.githubassets.com/1/vercel/next.js";

function githubPage(images: Array<string>): string {
  const tags = images
    .map((image) => `<meta property="og:image" content="${image}">`)
    .join("\n");
  return `<!doctype html><html><head>
<meta name="octolytics-dimension-repository_nwo" content="vercel/next.js">
${tags}
</head><body>
<div class="sidebarSection"><h2><span>About</span></h2>
<p class="description">The React Framework</p>
</div>
</body></html>`;
}

function githubGet(status: number, html = ""): GithubGet {
  return async () => new Response(html, { status });
}

const githubBase = {
  url: GITHUB_URL,
  source: "github" as const,
  sourceId: "vercel/next.js",
};

function browserPage(html: string): PageReadResult {
  return {
    ok: true,
    raw: { html, url: GITHUB_URL },
    sourceId: "vercel/next.js",
  };
}

function githubDeps(get: GithubGet, page: PageReadResult) {
  return {
    partition: "persist:test",
    githubGet: get,
    readGithubPage: async () => page,
  };
}

const browserFailed: PageReadResult = {
  ok: false,
  reason: "harvest_failed",
  sourceId: "vercel/next.js",
};

describe("github repo capture", () => {
  it("returns the direct fetch capture without leasing a browser", async () => {
    const capture = await captureFromSource(
      githubBase,
      githubDeps(githubGet(200, githubPage([GITHUB_CARD])), browserFailed),
    );
    expect(capture.media).toEqual([{ url: GITHUB_CARD, type: "image" }]);
    expect(capture.title).toBe("vercel/next.js");
  });

  it("reads the repository from the Save URL when no Source ID is stored", async () => {
    const capture = await captureFromSource(
      { url: GITHUB_URL, source: "github" },
      githubDeps(githubGet(200, githubPage([GITHUB_CARD])), browserFailed),
    );
    expect(capture.id).toBe("vercel/next.js");
  });

  it("treats a valid repo page with zero media as incomplete, not finished", async () => {
    await expect(
      captureFromSource(
        githubBase,
        githubDeps(githubGet(200, githubPage([])), browserFailed),
      ),
    ).rejects.toBeInstanceOf(CaptureIncompleteError);
  });

  it("keeps the medialess capture on the final attempt so the Save still completes", async () => {
    const capture = await captureFromSource(
      { ...githubBase, finalAttempt: true },
      githubDeps(githubGet(200, githubPage([])), browserFailed),
    );
    expect(capture.media).toEqual([]);
    expect(capture.description).toContain("The React Framework");
  });

  it("terminal-fails a 404 repository without falling back to the browser", async () => {
    await expect(
      captureFromSource(
        githubBase,
        githubDeps(githubGet(404), browserPage(githubPage([GITHUB_CARD]))),
      ),
    ).rejects.toBeInstanceOf(TerminalError);
  });

  it("maps a 429 to RateLimitedError with the retry-after", async () => {
    const get: GithubGet = async () =>
      new Response("", { status: 429, headers: { "retry-after": "90" } });
    await expect(
      captureFromSource(githubBase, githubDeps(get, browserFailed)),
    ).rejects.toMatchObject({
      retryAfterSec: 90,
    });
    await expect(
      captureFromSource(githubBase, githubDeps(get, browserFailed)),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("maps a 5xx to TransientError", async () => {
    await expect(
      captureFromSource(githubBase, githubDeps(githubGet(503), browserFailed)),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("falls back to the browser when the fetch is blocked", async () => {
    const capture = await captureFromSource(
      githubBase,
      githubDeps(githubGet(403), browserPage(githubPage([GITHUB_CARD]))),
    );
    expect(capture.media[0]?.url).toBe(GITHUB_CARD);
    expect(capture.description).toContain("The React Framework");
  });

  it("falls back to the browser when the page carries no repo meta", async () => {
    const capture = await captureFromSource(
      githubBase,
      githubDeps(
        githubGet(200, "<html><title>GitHub</title></html>"),
        browserPage(githubPage([GITHUB_CARD])),
      ),
    );
    expect(capture.media[0]?.url).toBe(GITHUB_CARD);
  });

  it("falls back to the browser when the fetch itself fails", async () => {
    const throwing: GithubGet = async () => {
      throw new Error("socket closed");
    };
    const capture = await captureFromSource(
      githubBase,
      githubDeps(throwing, browserPage(githubPage([GITHUB_CARD]))),
    );
    expect(capture.media[0]?.url).toBe(GITHUB_CARD);
  });

  it("treats a zero-media browser fallback as incomplete too", async () => {
    await expect(
      captureFromSource(
        githubBase,
        githubDeps(githubGet(403), browserPage(githubPage([]))),
      ),
    ).rejects.toBeInstanceOf(CaptureIncompleteError);
  });

  it("keeps a zero-media browser fallback on the final attempt", async () => {
    const capture = await captureFromSource(
      { ...githubBase, finalAttempt: true },
      githubDeps(githubGet(403), browserPage(githubPage([]))),
    );
    expect(capture.media).toEqual([]);
    expect(capture.title).toBe("vercel/next.js");
  });

  it("retries when the browser page carries no repository either", async () => {
    await expect(
      captureFromSource(
        githubBase,
        githubDeps(
          githubGet(403),
          browserPage("<html><title>GitHub</title></html>"),
        ),
      ),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("retries when both the fetch and the browser come back empty", async () => {
    await expect(
      captureFromSource(githubBase, githubDeps(githubGet(403), browserFailed)),
    ).rejects.toBeInstanceOf(TransientError);
  });
});
