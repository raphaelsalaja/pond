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

  it.each([
    ["auth_token", ".x.com", "twitter"],
    ["ct0", ".x.com", "twitter"],
    ["user_session", ".github.com", "github"],
  ])("reads a %s change on %s", (name, domain, source) => {
    expect(rotatedSessionSource({ name, domain })).toBe(source);
  });

  it.each([
    ["auth_token", ".x.com.example.org"],
    ["user_session", ".notgithub.com"],
    ["user_session", ".github.com.example.org"],
  ])("ignores %s on another host %s", (name, domain) => {
    expect(rotatedSessionSource({ name, domain })).toBeNull();
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
