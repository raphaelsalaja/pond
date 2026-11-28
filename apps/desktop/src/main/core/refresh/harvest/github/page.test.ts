// @vitest-environment node

import { describe, expect, it } from "vitest";
import { adapt } from "./item";
import { parseRepoPage } from "./page";

const REPO_URL = "https://github.com/vercel/next.js";

const CUSTOM_PREVIEW =
  "https://repository-images.githubusercontent.com/70107786/4602445c";
const GENERATED_PREVIEW = "https://opengraph.githubassets.com/1/vercel/next.js";

function repoPage(
  opts: { images?: Array<string>; repoMeta?: boolean } = {},
): string {
  const images = opts.images ?? [CUSTOM_PREVIEW];
  const imageTags = images
    .map((image) => `<meta property="og:image" content="${image}">`)
    .join("\n");
  const repoMeta =
    opts.repoMeta === false
      ? ""
      : '<meta name="octolytics-dimension-repository_nwo" content="vercel/next.js">';
  return `<!doctype html><html><head>
<meta property="og:title" content="GitHub - vercel/next.js: The React Framework">
${imageTags}
${repoMeta}
</head><body>
<div class="sidebarSection"><h2><span>About</span></h2>
<p class="description">The React Framework</p>
<div class="websiteRow"><a href="https://nextjs.org" target="_blank">nextjs.org</a></div>
<a href="/topics/react">react</a><a href="/topics/ssg">ssg</a>
<a href="#readme-ov-file">Readme</a>
</div>
<article class="markdown-body">
<div class="markdown-heading"><h2 class="heading-element">Getting Started</h2><a id="user-content-getting-started" class="anchor" href="#getting-started"><svg></svg></a></div>
<p>See <a href="#getting-started">the start</a> and <a href="/vercel/next.js/blob/canary/docs.md">the docs</a>.</p>
<p><img src="/vercel/next.js/raw/canary/logo.png" alt="Logo"></p>
<div class="snippet-clipboard-content"><pre><code>npx create-next-app</code></pre><div class="zeroclipboard-container"><clipboard-copy>Copy</clipboard-copy></div></div>
</article>
</body></html>`;
}

function capture(html: string) {
  const page = parseRepoPage(html, REPO_URL);
  if (!page) return null;
  return adapt(page, {
    source: "github",
    url: REPO_URL,
    sourceId: "vercel/next.js",
  });
}

describe("parseRepoPage", () => {
  it("reads the name, About line, topics, homepage and owner", () => {
    const result = capture(repoPage());

    expect(result?.title).toBe("vercel/next.js");
    expect(result?.description).toContain("The React Framework");
    expect(result?.description).toContain("Topics: react, ssg");
    expect(result?.extras?.externalLink).toBe("https://nextjs.org/");
    expect(result?.author).toMatchObject({
      handle: "vercel",
      profileUrl: "https://github.com/vercel",
      avatarUrl: "https://github.com/vercel.png",
    });
  });

  it("keeps the README as an article with page links resolved", () => {
    const html = capture(repoPage())?.article?.html ?? "";

    expect(html).toContain(
      '<h2 class="heading-element" id="user-content-getting-started">',
    );
    expect(html).toContain('href="#user-content-getting-started"');
    expect(html).toContain(
      'href="https://github.com/vercel/next.js/blob/canary/docs.md"',
    );
    expect(html).toContain(
      'src="https://github.com/vercel/next.js/raw/canary/logo.png"',
    );
    expect(html).not.toContain('class="anchor"');
    expect(html).not.toContain("clipboard-copy");
  });

  it("prefers a custom social preview, then GitHub's generated card", () => {
    const custom = capture(repoPage());
    expect(custom?.media).toEqual([{ url: CUSTOM_PREVIEW, type: "image" }]);

    const generated = capture(repoPage({ images: [GENERATED_PREVIEW] }));
    expect(generated?.media).toEqual([
      { url: GENERATED_PREVIEW, type: "image" },
    ]);

    const both = capture(
      repoPage({ images: [GENERATED_PREVIEW, CUSTOM_PREVIEW] }),
    );
    expect(both?.media).toEqual([{ url: CUSTOM_PREVIEW, type: "image" }]);

    const none = capture(repoPage({ images: [] }));
    expect(none?.media).toEqual([]);
  });

  it("returns nothing for a page without the repo meta", () => {
    expect(parseRepoPage(repoPage({ repoMeta: false }), REPO_URL)).toBeNull();
    expect(capture(repoPage({ repoMeta: false }))).toBeNull();
  });

  it("reads the same fields from real server-rendered markup", () => {
    const page = parseRepoPage(REALISTIC_PAGE, REPO_URL);
    expect(page?.title).toBe("vercel/next.js");
    expect(page?.mediaUrls).toEqual([
      { url: GENERATED_PREVIEW, type: "image" },
    ]);
    expect(String(page?.description)).toContain("The React Framework");
  });

  it("breaks README text into lines instead of merging block content", () => {
    const result = capture(repoPage());
    const description = result?.description ?? "";
    expect(description).toContain("Getting Started");
    expect(description).toContain("npx create-next-app");
  });
});

/** Mirrors what GitHub serves today: minified, class-hashed, meta in the head. */
const REALISTIC_PAGE = `<!doctype html><html><head><meta name="octolytics-dimension-repository_nwo" content="vercel/next.js"><meta property="og:image" content="${GENERATED_PREVIEW}"></head><body><div class="sidebarSection__oqw6Y8 border-0"><h2 class="sectionHeading__4n11uG prc-Heading-Heading-MtWFE" data-variant="small" data-component="Heading"><span>About</span></h2><p class="description__ej4leF prc-Text-Text-9mHv3" data-component="Text">The React Framework</p><div class="websiteRow__c4vvco"><a href="https://nextjs.org/" rel="noopener noreferrer">nextjs.org</a></div></div></body></html>`;
