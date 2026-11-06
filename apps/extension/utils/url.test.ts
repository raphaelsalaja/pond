import { describe, expect, it } from "vitest";
import { rotatedSessionSource } from "./url";

describe("rotatedSessionSource", () => {
  it("reads a YouTube session rotation", () => {
    expect(
      rotatedSessionSource({
        name: "__Secure-1PSIDTS",
        domain: ".youtube.com",
      }),
    ).toBe("youtube");
  });

  it("ignores the same cookie on Google's own domain", () => {
    expect(
      rotatedSessionSource({ name: "__Secure-1PSIDTS", domain: ".google.com" }),
    ).toBeNull();
  });

  it("ignores cookies that change on every request", () => {
    expect(
      rotatedSessionSource({ name: "SIDCC", domain: ".youtube.com" }),
    ).toBeNull();
  });
});
