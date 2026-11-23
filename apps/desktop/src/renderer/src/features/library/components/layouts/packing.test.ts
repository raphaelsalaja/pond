import { describe, expect, it } from "vitest";
import {
  packGrid,
  packJustified,
  packList,
  packWaterfall,
  stackSections,
} from "./packing";

describe("library layout packing", () => {
  it("keeps Grid slots uniform across mixed media", () => {
    const result = packGrid(["a", "b", "c"], 200, 90, 10, 20);

    expect(result.items).toEqual([
      {
        id: "a",
        top: 0,
        left: 0,
        width: 95,
        height: 115,
        mediaHeight: 95,
      },
      {
        id: "b",
        top: 0,
        left: 105,
        width: 95,
        height: 115,
        mediaHeight: 95,
      },
      {
        id: "c",
        top: 125,
        left: 0,
        width: 95,
        height: 115,
        mediaHeight: 95,
      },
    ]);
    expect(result.totalHeight).toBe(240);
  });

  it("uses the same slot contract for List rows", () => {
    expect(packList(["a", "b"], 400, 64, 48)).toEqual({
      items: [
        {
          id: "a",
          top: 0,
          left: 0,
          width: 400,
          height: 64,
          mediaHeight: 48,
        },
        {
          id: "b",
          top: 64,
          left: 0,
          width: 400,
          height: 64,
          mediaHeight: 48,
        },
      ],
      totalHeight: 128,
    });
  });

  it("places Waterfall entries in the shortest column", () => {
    const result = packWaterfall(
      [
        { id: "portrait", aspect: 0.5 },
        { id: "wide", aspect: 2 },
        { id: "square", aspect: 1 },
      ],
      200,
      90,
      10,
      20,
    );

    expect(result.items).toEqual([
      {
        id: "portrait",
        top: 0,
        left: 0,
        width: 95,
        height: 210,
        mediaHeight: 190,
      },
      {
        id: "wide",
        top: 0,
        left: 105,
        width: 95,
        height: 67.5,
        mediaHeight: 47.5,
      },
      {
        id: "square",
        top: 77.5,
        left: 105,
        width: 95,
        height: 115,
        mediaHeight: 95,
      },
    ]);
    expect(result.totalHeight).toBe(210);
  });

  it("fills complete Justified rows and leaves the final row natural", () => {
    const result = packJustified(
      [
        { id: "a", aspect: 1 },
        { id: "b", aspect: 1 },
        { id: "c", aspect: 2 },
      ],
      210,
      100,
      10,
      20,
    );

    expect(result.items).toEqual([
      {
        id: "a",
        top: 0,
        left: 0,
        width: 100,
        height: 120,
        mediaHeight: 100,
      },
      {
        id: "b",
        top: 0,
        left: 110,
        width: 100,
        height: 120,
        mediaHeight: 100,
      },
      {
        id: "c",
        top: 130,
        left: 0,
        width: 200,
        height: 120,
        mediaHeight: 100,
      },
    ]);
    expect(result.totalHeight).toBe(250);
  });

  it("stacks a lead section above the rest with room for a divider", () => {
    const lead = packList(["pinned"], 400, 64, 48);
    const rest = packList(["a", "b"], 400, 64, 48);
    const result = stackSections(lead, rest, 40);

    expect(result.dividerTop).toBe(64);
    expect(result.items.map(({ id, top }) => ({ id, top }))).toEqual([
      { id: "pinned", top: 0 },
      { id: "a", top: 104 },
      { id: "b", top: 168 },
    ]);
    expect(result.totalHeight).toBe(232);
  });

  it("keeps a single section untouched without a lead or divider", () => {
    const rest = packList(["a"], 400, 64, 48);
    const result = stackSections(undefined, rest, 0);

    expect(result.items).toBe(rest.items);
    expect(result.totalHeight).toBe(64);
    expect(result.dividerTop).toBe(0);
  });

  it("reserves the divider below a lead section with nothing after it", () => {
    const lead = packList(["pinned"], 400, 64, 48);
    const result = stackSections(lead, { items: [], totalHeight: 0 }, 40);

    expect(result.items.map((item) => item.id)).toEqual(["pinned"]);
    expect(result.dividerTop).toBe(64);
    expect(result.totalHeight).toBe(104);
  });
});
