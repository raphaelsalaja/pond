import type { JsonObject } from "@pond/schema/json";
import { describe, expect, it } from "vitest";
import { cosmosIdentityFromToken } from "./cosmos-token";

function jwtWith(payload: JsonObject): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("cosmosIdentityFromToken", () => {
  it("reads a numeric userId claim", () => {
    expect(cosmosIdentityFromToken(jwtWith({ userId: 42 }))).toBe("42");
  });

  it("reads the eid claim Cosmos's web client uses for the user id", () => {
    expect(
      cosmosIdentityFromToken(jwtWith({ eid: 42, sub: "session-uuid" })),
    ).toBe("42");
  });

  it("reads a numeric sub when userId is absent", () => {
    expect(cosmosIdentityFromToken(jwtWith({ sub: "99" }))).toBe("99");
  });

  it("ignores non-numeric identity claims", () => {
    expect(
      cosmosIdentityFromToken(jwtWith({ sub: "user-uuid", username: "jane" })),
    ).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(cosmosIdentityFromToken("not-a-jwt")).toBeNull();
    expect(cosmosIdentityFromToken("")).toBeNull();
  });
});
