import type { ImportCollection } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import { walkEveryCollection } from "./every-collection";

const DESIGN = { id: "c1", name: "Design" };

describe("walkEveryCollection", () => {
  it("walks every listed collection and keeps names for the Folders", async () => {
    const walked: Array<ReadonlyArray<ImportCollection>> = [];
    const walk = async (collections: ReadonlyArray<ImportCollection>) => {
      walked.push(collections);
      return {
        ok: true as const,
        entries: [{ sourceId: "t1", collectionIds: ["c1"] }],
      };
    };
    await expect(
      walkEveryCollection("Folders", {
        list: async () => ({
          ok: true,
          collections: [{ ...DESIGN, itemCount: 4 }],
        }),
        walk,
      }),
    ).resolves.toEqual({
      collections: [DESIGN],
      entries: [{ sourceId: "t1", collectionIds: ["c1"] }],
      gap: null,
    });
    expect(walked).toEqual([[DESIGN]]);
  });

  it("turns a failed list or walk into a gap note", async () => {
    await expect(
      walkEveryCollection("Folders", {
        list: async () => ({ ok: false, reason: "auth_required" }),
        walk: vi.fn(),
      }),
    ).resolves.toMatchObject({ collections: [], entries: [] });
    const walked = await walkEveryCollection("Folders", {
      list: async () => ({ ok: true, collections: [DESIGN] }),
      walk: async () => ({ ok: false, reason: "rate_limited" }),
    });
    expect(walked.collections).toEqual([]);
    expect(walked.gap).toMatch(/^Folders unavailable/);
  });

  it("skips the walk when there are no collections", async () => {
    const walk = vi.fn();
    await walkEveryCollection("Folders", {
      list: async () => ({ ok: true, collections: [] }),
      walk,
    });
    expect(walk).not.toHaveBeenCalled();
  });
});
