import { describe, expect, it } from "vitest";
import { canShareOn } from "./platform";

describe("canShareOn", () => {
  it("offers the share sheet on macOS only", () => {
    expect(canShareOn("MacIntel")).toBe(true);
    expect(canShareOn("Win32")).toBe(false);
    expect(canShareOn("Linux x86_64")).toBe(false);
  });
});
