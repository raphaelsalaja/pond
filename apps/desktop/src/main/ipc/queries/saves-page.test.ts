import { describe, expect, it } from "vitest";
import { pageAfter } from "./saves-page";

describe("pageAfter", () => {
  it("uses id as a stable timestamp tie-breaker", () => {
    const cursor = { savedAt: 100, id: "m" };
    expect(pageAfter({ savedAt: 101, id: "z" }, cursor)).toBe(false);
    expect(pageAfter({ savedAt: 100, id: "a" }, cursor)).toBe(true);
    expect(pageAfter({ savedAt: 99, id: "z" }, cursor)).toBe(true);
  });
});
