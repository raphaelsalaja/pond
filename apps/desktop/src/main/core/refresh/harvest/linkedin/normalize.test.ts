import { describe, expect, it } from "vitest";
import { clusterReply, POST_ID, savedPost, textPost } from "./fixture";
import { inPageLinkedInNormalize } from "./normalize";

const norm = inPageLinkedInNormalize();
const UGC_ID = "7198765432109876543";

describe("LinkedIn saved posts reply", () => {
  it("keeps the cluster's order and reads each post", () => {
    const posts = [savedPost(POST_ID), textPost(UGC_ID)];
    const reply = clusterReply(posts, { start: 0, count: 10, total: 2 });
    const page = norm.clusterPage(reply);
    expect(page.count).toBe(2);
    expect(page.total).toBe(2);
    expect(page.entries).toEqual([
      {
        sourceId: POST_ID,
        url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}/`,
        listKinds: ["saved"],
        title: "Shipping our new design system today.",
        description:
          "Shipping our new design system today.\nHere's what we learned.",
        author: "Jane Doe",
        mediaUrl:
          "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_800/0",
        mediaUrls: [
          {
            url: "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_800/0",
            type: "image",
          },
        ],
        mediaType: "image",
      },
      {
        sourceId: UGC_ID,
        url: `https://www.linkedin.com/feed/update/urn:li:ugcPost:${UGC_ID}/`,
        listKinds: ["saved"],
        title: "We're hiring.",
        description: "We're hiring.",
        author: "Acme",
        mediaType: "text",
      },
    ]);
  });

  it("counts a result it cannot read so the walk moves past it", () => {
    const unreadable = {
      ...savedPost(POST_ID),
      entityUrn: "urn:li:fsd_entityResultViewModel:(urn:li:x:1)",
      trackingUrn: "urn:li:x:1",
      navigationUrl: "https://www.linkedin.com/in/janedoe/",
    };
    const reply = clusterReply([unreadable], { start: 0, count: 10 });
    const page = norm.clusterPage(reply);
    expect(page.entries).toEqual([]);
    expect(page.count).toBe(1);
  });

  it("reads an empty reply as the end of the list", () => {
    expect(norm.clusterPage({})).toEqual({ entries: [], count: 0 });
  });
});

describe("LinkedIn post ids", () => {
  it("reads feed URNs and post slugs", () => {
    const slug = norm.postRef([
      "https://www.linkedin.com/posts/janedoe_design-activity-7212345678901234567-AbCd/",
    ]);
    expect(slug).toEqual({ kind: "activity", id: POST_ID });
    const encoded = norm.postRef([`urn%3Ali%3AugcPost%3A${UGC_ID}`]);
    expect(encoded).toEqual({ kind: "ugcPost", id: UGC_ID });
    const profile = norm.postRef(["https://www.linkedin.com/in/janedoe/"]);
    expect(profile).toBeNull();
  });

  it("dates a post from its id", () => {
    expect(norm.publishedAtFromId(POST_ID)).toBe("2024-06-28T06:46:48.752Z");
    expect(norm.publishedAtFromId("12345")).toBeUndefined();
  });
});
