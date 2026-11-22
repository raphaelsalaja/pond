import { describe, expect, it } from "vitest";
import type { LibraryHealthCheck } from "../../../shared/library-health-contracts";
import { healthNotifications } from "./notifications";

function check(overrides: Partial<LibraryHealthCheck> = {}): LibraryHealthCheck {
  return {
    checkedAt: 1,
    durationMs: 1,
    saves: 10,
    counts: {
      thumbnails: 0,
      "physical-file-names": 0,
      "invalid-content": 0,
      "save-metadata": 0,
      posters: 0,
      unverified: 0,
    },
    issues: [],
    posters: [],
    unverified: [],
    index: { orphans: [], missing: [], unreadable: [], backupError: null },
    indexError: null,
    ...overrides,
  };
}

describe("healthNotifications", () => {
  it("resolves every category when the check is clean", () => {
    const { posts, resolved } = healthNotifications(check());
    expect(posts).toEqual([]);
    expect(resolved).toEqual([
      "health:originals",
      "health:previews",
      "health:records",
      "health:file-names",
      "health:index",
    ]);
  });

  it("posts a priority attention notification per category with findings", () => {
    const { posts, resolved } = healthNotifications(
      check({
        counts: {
          thumbnails: 3,
          "physical-file-names": 0,
          "invalid-content": 1,
          "save-metadata": 0,
          posters: 0,
          unverified: 1,
        },
      }),
    );
    expect(posts.map((post) => [post.id, post.body])).toEqual([
      ["health:originals", "2 Saves need attention"],
      ["health:previews", "3 Saves need attention"],
    ]);
    expect(posts[0]).toMatchObject({
      kind: "attention",
      priority: true,
      target: { type: "health", categoryId: "originals" },
    });
    expect(resolved).toContain("health:records");
    expect(resolved).not.toContain("health:previews");
  });

  it("flags the index when it couldn't be read", () => {
    const { posts } = healthNotifications(
      check({ index: null, indexError: "locked" }),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("health:index");
    expect(posts[0]?.body).toMatch(/couldn't read the library index/);
  });
});
