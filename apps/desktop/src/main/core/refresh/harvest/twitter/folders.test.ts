import { describe, expect, it } from "vitest";
import { parseBookmarkFolders } from "./folders";

const page = (items: Array<{ id: string; name: string }>) =>
  JSON.stringify({
    data: {
      viewer: {
        user_results: {
          result: {
            __typename: "User",
            bookmark_collections_slice: { items, slice_info: {} },
          },
        },
      },
    },
  });

describe("parseBookmarkFolders", () => {
  it("reads folders across captured pages without repeats", () => {
    expect(
      parseBookmarkFolders([
        page([
          { id: "1720", name: "Type" },
          { id: "1721", name: "" },
        ]),
        page([{ id: "1720", name: "Type" }]),
      ]),
    ).toEqual([
      { id: "1720", name: "Type", itemCount: null },
      { id: "1721", name: "1721", itemCount: null },
    ]);
  });

  it("skips bodies that aren't JSON or carry no folders", () => {
    expect(
      parseBookmarkFolders(["<html>", JSON.stringify({ data: {} })]),
    ).toEqual([]);
    expect(parseBookmarkFolders(null)).toEqual([]);
  });
});
