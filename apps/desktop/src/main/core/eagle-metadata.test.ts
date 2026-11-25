import { describe, expect, it } from "vitest";
import {
  approximateEagleRules,
  EagleSmartFolderSchema,
  eaglePaletteColor,
  eagleSmartFolderQuery,
  unsupportedEagleRules,
} from "./eagle-metadata";

describe("Eagle documented metadata conversion", () => {
  it("preserves RGB palettes from the official item API representation", () => {
    expect(eaglePaletteColor({ color: [132, 236, 244] })).toBe("#84ecf4");
    expect(eaglePaletteColor("#123456")).toBe("#123456");
  });
  it("keeps a relative smart folder rolling as days pass", () => {
    expect(
      eagleSmartFolderQuery({
        id: "recent",
        name: "Last Week",
        conditions: [
          {
            match: "OR",
            rules: [{ property: "createTime", method: "within", value: [7] }],
          },
        ],
      }),
    ).toEqual({
      combinator: "or",
      rules: [{ field: "savedAt", operator: "gte", value: "-P7D" }],
    });
  });
  it("maps tag intersection without changing the group combinator", () => {
    expect(
      eagleSmartFolderQuery({
        id: "tags",
        name: "Posters",
        conditions: [
          {
            match: "AND",
            rules: [
              {
                property: "tags",
                method: "intersection",
                value: ["Poster", "Print"],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [{ field: "tags", operator: "every", value: ["Poster", "Print"] }],
    });
  });
  it("preserves separate AND/OR blocks and false conditions", () => {
    expect(
      eagleSmartFolderQuery({
        id: "combined",
        name: "Combined",
        conditions: [
          {
            match: "OR",
            boolean: "FALSE",
            rules: [{ property: "tags", method: "union", value: ["Draft"] }],
          },
          {
            match: "AND",
            rules: [{ property: "width", method: ">=", value: [1200] }],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [
        {
          combinator: "or",
          not: true,
          rules: [{ field: "tags", operator: "some", value: ["Draft"] }],
        },
        {
          combinator: "and",
          rules: [{ field: "width", operator: "gte", value: 1200 }],
        },
      ],
    });
  });
  it("maps folder identities and exact membership sets", () => {
    expect(
      eagleSmartFolderQuery(
        {
          id: "folder",
          name: "Folder",
          conditions: [
            {
              match: "AND",
              rules: [
                {
                  property: "folders",
                  method: "equal",
                  value: ["eagle-folder"],
                },
              ],
            },
          ],
        },
        new Map([["eagle-folder", "pond-folder"]]),
      ),
    ).toEqual({
      combinator: "and",
      rules: [{ field: "folder", operator: "exact", value: ["pond-folder"] }],
    });
  });
  it("converts Eagle file-size units to bytes", () => {
    expect(
      eagleSmartFolderQuery({
        id: "size",
        name: "Large",
        conditions: [
          {
            match: "AND",
            rules: [
              {
                property: "fileSize",
                method: "between",
                value: [2, 4],
                unit: "mb",
              },
            ],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [
        {
          field: "fileSize",
          operator: "between",
          value: [2_097_152, 4_194_304],
        },
      ],
    });
  });
  it("maps image extensions to Pond's format set operators", () => {
    expect(
      eagleSmartFolderQuery({
        id: "png",
        name: "PNG",
        conditions: [
          {
            match: "AND",
            rules: [{ property: "type", method: "equal", value: "png" }],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [{ field: "format", operator: "some", value: ["png"] }],
    });
  });
  it("maps Eagle's capture timestamp to Date Taken, including a single day", () => {
    const day = new Date(2026, 4, 3).getTime();
    expect(
      eagleSmartFolderQuery({
        id: "shot",
        name: "Shot That Day",
        conditions: [
          {
            match: "AND",
            rules: [{ property: "timestamp", method: "on", value: [day] }],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [
        {
          field: "takenAt",
          operator: "between",
          value: [day, day + 86_399_999],
        },
      ],
    });
  });
  it("maps BPM ranges and font activation", () => {
    expect(
      eagleSmartFolderQuery({
        id: "audio",
        name: "Fast Tracks",
        conditions: [
          {
            match: "AND",
            rules: [
              { property: "bpm", method: ">=", value: [160, 0] },
              { property: "fontActivated", method: "deactivate" },
            ],
          },
        ],
      }),
    ).toEqual({
      combinator: "and",
      rules: [
        { field: "bpm", operator: "gte", value: 160 },
        { field: "fontActivated", operator: "eq", value: false },
      ],
    });
  });
  it("recognizes Eagle's empty-conditions Group with nested Smart Folders", () => {
    const group = EagleSmartFolderSchema.parse({
      id: "group",
      name: "Work",
      conditions: [],
      children: [{ id: "child", name: "Child", conditions: [] }],
    });
    expect(group.children).toHaveLength(1);
    expect(eagleSmartFolderQuery(group)).toEqual({
      combinator: "and",
      rules: [],
    });
  });
  it("reports the exact unsupported field and operator", () => {
    const folder = EagleSmartFolderSchema.parse({
      id: "regex",
      name: "Files",
      conditions: [
        {
          match: "AND",
          rules: [{ property: "name", method: "regex", value: "file.*" }],
        },
      ],
    });
    expect(unsupportedEagleRules(folder, new Map())).toEqual([
      "Files: name/regex",
    ]);
  });
  it("rejects the entire smart folder when one condition cannot be translated", () => {
    expect(
      eagleSmartFolderQuery({
        id: "colors",
        name: "Gray Posters",
        conditions: [
          {
            match: "AND",
            rules: [
              { property: "tags", method: "intersection", value: ["Poster"] },
              { property: "color", method: "grayscale" },
            ],
          },
        ],
      }),
    ).toBeNull();
  });
  it("translates color, shape, and camera as close matches and reports them", () => {
    const folder = EagleSmartFolderSchema.parse({
      id: "close",
      name: "Red Landscapes",
      conditions: [
        {
          match: "AND",
          rules: [
            { property: "color", method: "accuracy", value: "#ff2600" },
            { property: "shape", method: "equal", value: "landscape" },
            { property: "camera", method: "uncontain", value: "iPhone" },
            { property: "tags", method: "union", value: ["Poster"] },
          ],
        },
      ],
    });
    expect(eagleSmartFolderQuery(folder)).toEqual({
      combinator: "and",
      rules: [
        {
          field: "color",
          operator: "near",
          value: { hex: "#ff2600", tolerance: 30 },
        },
        { field: "shape", operator: "eq", value: "landscape" },
        {
          combinator: "and",
          rules: [
            {
              field: "cameraMake",
              operator: "contains",
              value: "iPhone",
              negate: true,
            },
            {
              field: "cameraModel",
              operator: "contains",
              value: "iPhone",
              negate: true,
            },
          ],
        },
        { field: "tags", operator: "some", value: ["Poster"] },
      ],
    });
    expect(approximateEagleRules(folder, new Map())).toEqual([
      "Red Landscapes: color/accuracy",
      "Red Landscapes: shape/equal",
      "Red Landscapes: camera/uncontain",
    ]);
  });
  it("keeps rejecting Eagle's custom aspect shape", () => {
    expect(
      eagleSmartFolderQuery({
        id: "custom",
        name: "Custom",
        conditions: [
          {
            match: "AND",
            rules: [{ property: "shape", method: "equal", value: "custom" }],
          },
        ],
      }),
    ).toBeNull();
  });
});
