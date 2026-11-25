import { describe, expect, it } from "vitest";
import { captureFromPost, feedItems, htmlToText, postEntry } from "./normalize";

const PUB = { id: 7, name: "Lenny's Newsletter", subdomain: "Lenny" };
const POST = {
  id: 151_234_567,
  slug: "how-to-price",
  title: "How to price",
  subtitle: "A guide",
  cover_image: "https://substackcdn.com/cover.jpg",
  publishedBylines: [{ name: "Lenny", handle: "lenny" }],
};

describe("postEntry", () => {
  it("keys a post by its publication address", () => {
    expect(postEntry(POST, PUB, new Set())).toEqual({
      sourceId: "lenny.substack.com/p/how-to-price",
      url: "https://lenny.substack.com/p/how-to-price",
      title: "How to price",
      description: "A guide",
      author: "Lenny",
      mediaUrl: "https://substackcdn.com/cover.jpg",
      mediaType: "image",
    });
  });

  it("keeps the id address a reader save already used", () => {
    const entry = postEntry(POST, PUB, new Set(["p-151234567"]));
    expect(entry.sourceId).toBe("p-151234567");
    expect(entry.url).toBe("https://substack.com/home/post/p-151234567");
  });

  it("falls back to the id without a publication", () => {
    expect(postEntry({ id: 9 }, null, new Set()).sourceId).toBe("p-9");
  });
});

describe("captureFromPost", () => {
  it("reads the body, byline, and publication", () => {
    const capture = captureFromPost(
      {
        ...POST,
        body_html: "<p>One &amp; two</p><p>Three</p>",
        post_date: "2026-10-01T12:00:00.000Z",
        reaction_count: 12,
      },
      PUB,
      "lenny.substack.com/p/how-to-price",
      "https://lenny.substack.com/p/how-to-price",
    );
    expect(capture).toMatchObject({
      id: "lenny.substack.com/p/how-to-price",
      source: "substack",
      title: "How to price",
      description: "A guide\n\nOne & two\n\nThree",
      publishedAt: "2026-10-01T12:00:00.000Z",
      author: {
        name: "Lenny",
        handle: "lenny",
        profileUrl: "https://substack.com/@lenny",
      },
      metrics: { likes: 12 },
      extras: { publisher: "Lenny's Newsletter" },
      media: [{ url: "https://substackcdn.com/cover.jpg", type: "image" }],
    });
  });

  it("carries the post body as an article", () => {
    const capture = captureFromPost(
      {
        ...POST,
        body_html: "<p>One</p><p>Two</p>",
        canonical_url: "https://www.lennysnewsletter.com/p/how-to-price",
        audience: "everyone",
      },
      PUB,
      "lenny.substack.com/p/how-to-price",
      "https://lenny.substack.com/p/how-to-price",
    );
    expect(capture.article).toEqual({
      html: "<p>One</p><p>Two</p>",
      subtitle: "A guide",
      canonicalUrl: "https://www.lennysnewsletter.com/p/how-to-price",
    });
  });

  it("marks a paid post with a short body as a preview", () => {
    const capture = captureFromPost(
      {
        ...POST,
        body_html: "<p>Only the opening words</p>",
        audience: "only_paid",
        wordcount: 2400,
      },
      PUB,
      "lenny.substack.com/p/how-to-price",
      "https://lenny.substack.com/p/how-to-price",
    );
    expect(capture.article?.preview).toBe(true);
  });

  it("falls back to the truncated text when the body is withheld", () => {
    const capture = captureFromPost(
      {
        ...POST,
        body_html: null,
        truncated_body_text: "Teaser <here>",
        audience: "only_paid",
      },
      PUB,
      "lenny.substack.com/p/how-to-price",
      "https://lenny.substack.com/p/how-to-price",
    );
    expect(capture.article).toMatchObject({
      html: "<p>Teaser &lt;here&gt;</p>",
      preview: true,
    });
  });

  it("leaves out the article when the post has no body", () => {
    const capture = captureFromPost(
      POST,
      PUB,
      "lenny.substack.com/p/how-to-price",
      "https://lenny.substack.com/p/how-to-price",
    );
    expect(capture.article).toBeUndefined();
  });
});

describe("feedItems", () => {
  it("addresses custom-domain links on the publication subdomain", () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Pricing &amp; packaging]]></title>
        <link>https://www.lennysnewsletter.com/p/pricing</link>
        <dc:creator><![CDATA[Lenny]]></dc:creator>
        <pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate>
        <enclosure url="https://substackcdn.com/a.jpg?w=1&amp;h=2" length="0" type="image/jpeg"/>
      </item>
      <item><title>No link</title></item>
    </channel></rss>`;
    expect(feedItems(xml, "lenny")).toEqual([
      {
        url: "https://lenny.substack.com/p/pricing",
        sourceId: "lenny.substack.com/p/pricing",
        title: "Pricing & packaging",
        author: "Lenny",
        publishedAt: "2026-10-01T12:00:00.000Z",
        mediaUrl: "https://substackcdn.com/a.jpg?w=1&h=2",
      },
    ]);
  });
});

describe("htmlToText", () => {
  it("drops figures and keeps list items", () => {
    expect(
      htmlToText(
        "<h2>Steps</h2><figure><img src=x></figure><ul><li>One</li><li>Two</li></ul>",
      ),
    ).toBe("Steps\n\n- One\n\n- Two");
  });
});
