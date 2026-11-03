import { describe, expect, it } from "vitest";
import { canonicalPondSaveId } from "./pond-url";

describe("canonicalPondSaveId", () => {
  it("restores the upper-case ULID that a pond:// URL lowercases", () => {
    const url = new URL(
      "pond://01m6g9w0kwqjncxve71hctpdds/Screenshot%20From%202026-10-30%2008-21-58.png",
    );
    expect(canonicalPondSaveId(url.hostname)).toBe(
      "01M6G9W0KWQJNCXVE71HCTPDDS",
    );
  });
});
