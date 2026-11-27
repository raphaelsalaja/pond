import { createHash } from "node:crypto";
import type { SharePageManifest } from "@pond/schema/share-page";
import { describe, expect, it } from "vitest";
import { sharePageHtml } from "./html";

const VIEWER = { script: "console.log('viewer')", style: "body{margin:0}" };

const MANIFEST: SharePageManifest = {
  version: 1,
  kind: "save",
  title: "</script><script>alert(1)</script> & <b>",
  createdAt: "2026-11-27T12:00:00.000Z",
  saves: [{ id: "s1", source: "Web", media: [], text: "Line break </script>" }],
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

describe("sharePageHtml", () => {
  const html = sharePageHtml(MANIFEST, VIEWER);

  it("keeps Library text from closing the manifest block", () => {
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const json = html.match(
      /<script type="application\/json" id="pond-share-page">(.*?)<\/script>/s,
    )?.[1];
    expect(JSON.parse(json ?? "")).toEqual(MANIFEST);
  });

  it("escapes the title", () => {
    expect(html).toContain(
      "<title>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;</title>",
    );
  });

  it("allows only its own viewer to run", () => {
    expect(html).toContain(`script-src 'sha256-${hash(VIEWER.script)}'`);
    expect(html).toContain(`style-src 'sha256-${hash(VIEWER.style)}'`);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it("adds link previews only for a page with a public address", () => {
    expect(html).not.toContain("og:title");
    const shared = sharePageHtml(
      {
        ...MANIFEST,
        saves: [
          {
            id: "s1",
            source: "Web",
            media: [],
            thumbnail: { src: "media/s1-thumb.webp", width: 720, height: 900 },
          },
        ],
      },
      VIEWER,
      { pageUrl: "https://links.example.com/abc/index.html" },
    );
    expect(shared).toContain(
      '<meta property="og:image" content="https://links.example.com/abc/media/s1-thumb.webp">',
    );
    expect(shared).toContain(
      '<meta property="og:description" content="1 Save">',
    );
    expect(shared).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
  });

  it("refuses a viewer that would end its own element", () => {
    expect(() =>
      sharePageHtml(MANIFEST, { ...VIEWER, script: "'</script>'" }),
    ).toThrow();
  });
});
