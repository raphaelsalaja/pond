import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { InstagramPostExtractor } from "./instagram";

function probe(page: {
  viewer?: unknown;
  profileHref?: string;
  scripts?: string[];
}): string {
  const img = page.profileHref
    ? { closest: () => ({ getAttribute: () => page.profileHref }) }
    : null;
  return runInNewContext(new InstagramPostExtractor().probeExpression, {
    window: {
      require: (name: string) => {
        if (name !== "PolarisConfig" || page.viewer === undefined) {
          throw new Error(`Requiring unknown module "${name}"`);
        }
        return { getViewerData_DO_NOT_USE: () => page.viewer };
      },
    },
    document: {
      querySelector: () => img,
      scripts: (page.scripts ?? []).map((textContent) => ({ textContent })),
    },
  });
}

describe("InstagramPostExtractor probe", () => {
  it("reads the username from the web app's viewer record", () => {
    expect(probe({ viewer: { username: "oluwa.rafa" } })).toBe("oluwa.rafa");
  });

  it("ignores a viewer record without a usable username", () => {
    expect(probe({ viewer: { username: "<script>" } })).toBe("");
    expect(probe({ viewer: null })).toBe("");
  });

  it("falls back to the profile link when the record is missing", () => {
    expect(probe({ profileHref: "/oluwa.rafa/" })).toBe("oluwa.rafa");
  });
});
