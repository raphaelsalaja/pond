import { describe, expect, it } from "vitest";
import {
  AppreciatedSchema,
  appreciatedAt,
  appreciationEntry,
} from "./normalize";

const FIXTURE = {
  user: {
    appreciatedProjects: {
      pageInfo: {
        endCursor: "MjAxNi0wNi0wNiAyMzoxMDowNA==",
        hasNextPage: true,
      },
      edges: [
        {
          cursor: "MjAxOS0xMC0wMSAyMDozMjowNQ==",
          node: {
            __typename: "Project",
            id: 86_248_267,
            name: "Semplice Supply \u2014 High Quality device renders",
            url: "https://www.behance.net/gallery/86248267/Semplice-Supply-High-Quality-device-renders",
            publishedOn: 1_569_958_904,
            covers: {
              size_808: {
                url: "https://mir-s3-cdn-cf.behance.net/projects/808/404a7386248267.Y3JvcCwxNTk0LDEyNDcsMCww.jpg",
              },
              size_original: {
                url: "https://mir-s3-cdn-cf.behance.net/projects/original/404a7386248267.Y3JvcCwxNTk0LDEyNDcsMCww.jpg",
              },
            },
            owners: [
              {
                username: "vanschneider",
                displayName: "House of van Schneider",
              },
              { username: "lugotype", displayName: "Lu Yu" },
            ],
          },
        },
      ],
    },
  },
};

describe("behance normalize", () => {
  it("maps an appreciation edge to a list entry", () => {
    const parsed = AppreciatedSchema.parse(FIXTURE);
    const [edge] = parsed.user?.appreciatedProjects.edges ?? [];
    if (!edge) throw new Error("missing edge");
    expect(appreciationEntry(edge)).toEqual({
      sourceId: "86248267",
      url: "https://www.behance.net/gallery/86248267/Semplice-Supply-High-Quality-device-renders",
      listKinds: ["liked"],
      savedAt: "2019-10-01T20:32:05.000Z",
      title: "Semplice Supply \u2014 High Quality device renders",
      author: "House of van Schneider",
      mediaUrl:
        "https://mir-s3-cdn-cf.behance.net/projects/original/404a7386248267.Y3JvcCwxNTk0LDEyNDcsMCww.jpg",
      mediaUrls: [
        {
          url: "https://mir-s3-cdn-cf.behance.net/projects/original/404a7386248267.Y3JvcCwxNTk0LDEyNDcsMCww.jpg",
          type: "image",
        },
      ],
      mediaType: "image",
    });
  });

  it("reads the appreciation time from the edge cursor", () => {
    expect(appreciatedAt("MjAxOS0xMC0wMSAyMDozMjowNQ==")).toBe(
      "2019-10-01T20:32:05.000Z",
    );
    expect(appreciatedAt(Buffer.from("not a date").toString("base64"))).toBe(
      undefined,
    );
    expect(appreciatedAt(undefined)).toBe(undefined);
  });

  it("keeps a cover-less project as a link and drops unreadable nodes", () => {
    const parsed = AppreciatedSchema.parse({
      user: {
        appreciatedProjects: {
          pageInfo: { endCursor: null, hasNextPage: false },
          edges: [
            { cursor: "junk", node: { id: "7", owners: [] } },
            { cursor: "junk", node: { name: "no id" } },
          ],
        },
      },
    });
    const [kept, dropped] = parsed.user?.appreciatedProjects.edges ?? [];
    if (!kept || !dropped) throw new Error("missing edges");
    expect(appreciationEntry(kept)).toEqual({
      sourceId: "7",
      url: "https://www.behance.net/gallery/7/a",
      listKinds: ["liked"],
      mediaType: "link",
    });
    expect(appreciationEntry(dropped)).toBe(null);
  });

  it("reads a logged-out user as null", () => {
    expect(AppreciatedSchema.parse({ user: null }).user).toBe(null);
  });
});
