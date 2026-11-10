// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { adapt, buildExpression } from "./item";

const REPO_URL = "https://github.com/vercel/next.js";

const CUSTOM_PREVIEW =
  "https://repository-images.githubusercontent.com/70107786/4602445c";
const GENERATED_PREVIEW = "https://opengraph.githubassets.com/1/vercel/next.js";

function repoPage(
  opts: { images?: string[]; repoMeta?: boolean } = {},
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

async function harvest(html: string) {
  const dom = new JSDOM(html, { url: REPO_URL, runScripts: "outside-only" });
  const raw = await runInContext(
    buildExpression("vercel/next.js"),
    dom.getInternalVMContext(),
  );
  return adapt(raw, {
    source: "github",
    url: REPO_URL,
    sourceId: "vercel/next.js",
  });
}

describe("GitHub repo page", () => {
  it("reads the name, About line, topics, homepage and owner", async () => {
    const capture = await harvest(repoPage());

    expect(capture?.title).toBe("vercel/next.js");
    expect(capture?.description).toContain("The React Framework");
    expect(capture?.description).toContain("Topics: react, ssg");
    expect(capture?.extras?.externalLink).toBe("https://nextjs.org/");
    expect(capture?.author).toMatchObject({
      handle: "vercel",
      profileUrl: "https://github.com/vercel",
      avatarUrl: "https://github.com/vercel.png",
    });
  });

  it("keeps the README as an article with page links resolved", async () => {
    const html = (await harvest(repoPage()))?.article?.html ?? "";

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

  it("prefers a custom social preview, then GitHub's generated card", async () => {
    const custom = await harvest(repoPage());
    expect(custom?.media).toEqual([{ url: CUSTOM_PREVIEW, type: "image" }]);

    const generated = await harvest(repoPage({ images: [GENERATED_PREVIEW] }));
    expect(generated?.media).toEqual([
      { url: GENERATED_PREVIEW, type: "image" },
    ]);

    const both = await harvest(
      repoPage({ images: [GENERATED_PREVIEW, CUSTOM_PREVIEW] }),
    );
    expect(both?.media).toEqual([{ url: CUSTOM_PREVIEW, type: "image" }]);

    const none = await harvest(repoPage({ images: [] }));
    expect(none?.media).toEqual([]);
  });

  it("returns nothing for a page without the repo meta", async () => {
    expect(await harvest(repoPage({ repoMeta: false }))).toBeNull();
  });
});
