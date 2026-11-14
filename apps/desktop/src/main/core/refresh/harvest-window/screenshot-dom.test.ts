import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildArticleRectExpression,
  buildCaptureMediaSettledExpression,
} from "./screenshot-dom";

const PHOTO = "https://pbs.twimg.com/media/a.jpg";
const POSTER = "https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg";

/** Stands in for X: an image is loaded once its src is in `__loaded`, and a spinner has a visible box. */
function postPage(body: string) {
  const dom = new JSDOM(body, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://x.com/a/status/1",
  });
  // SAFETY: the fixture script is a fixed string that stands in for image loading and layout.
  dom.window.eval(`
    globalThis.__loaded = new Set();
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      get() { return __loaded.has(this.getAttribute("src")); },
    });
    const box = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.getAttribute("role") === "progressbar") {
        return { x: 0, y: 0, top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 };
      }
      return box.call(this);
    };
  `);
  return dom;
}

function loadLater(dom: JSDOM, src: string): void {
  setTimeout(() => {
    // SAFETY: the fixture script is built from a fixed test URL.
    dom.window.eval(`__loaded.add(${JSON.stringify(src)})`);
  }, 250);
}

async function settle(dom: JSDOM, timeoutMs: number): Promise<boolean> {
  // SAFETY: the expression is built by the module under test from a number.
  const settled = await dom.window.eval(
    buildCaptureMediaSettledExpression(timeoutMs),
  );
  return z.boolean().parse(settled);
}

describe("capture media wait", () => {
  it("waits for the post's photo to load", async () => {
    const dom = postPage(
      `<article data-pond-capture><img src="${PHOTO}"></article>`,
    );

    loadLater(dom, PHOTO);
    const settled = await settle(dom, 2_000);

    expect(settled).toBe(true);
  });

  it("waits for a video poster", async () => {
    const dom = postPage(
      `<article data-pond-capture><video poster="${POSTER}"></video></article>`,
    );

    loadLater(dom, POSTER);
    const settled = await settle(dom, 2_000);

    expect(settled).toBe(true);
  });

  it("gives up while X's loading spinner still shows", async () => {
    const dom = postPage(
      '<article data-pond-capture><div role="progressbar"></div></article>',
    );

    const settled = await settle(dom, 300);

    expect(settled).toBe(false);
  });

  it("ignores media outside the captured post", async () => {
    const dom = postPage(
      `<article data-pond-capture></article><article><img src="${PHOTO}"><div role="progressbar"></div></article>`,
    );

    const settled = await settle(dom, 300);

    expect(settled).toBe(true);
  });
});

describe("buildArticleRectExpression", () => {
  it("marks only the requested post for the media wait", async () => {
    const dom = postPage(
      '<article id="old" data-pond-capture></article><article id="post"><a href="/a/status/1">post</a></article>',
    );

    // SAFETY: the expression is built by the module under test from a fixed id.
    await dom.window.eval(buildArticleRectExpression("1"));

    const marked = Array.from(
      dom.window.document.querySelectorAll("[data-pond-capture]"),
      (el) => el.id,
    );
    expect(marked).toEqual(["post"]);
  });
});
