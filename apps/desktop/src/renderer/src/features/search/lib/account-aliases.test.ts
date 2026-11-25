import { describe, expect, it } from "vitest";
import {
  accountChipLabel,
  accountDisplayName,
  displayAccountToken,
  resolveAccountToken,
} from "./account-aliases";
import type { AccountRef } from "./account-aliases";

const twitter: AccountRef = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  source: "twitter",
  handle: "raphaelsalaja",
  label: null,
};

const instagram: AccountRef = {
  id: "01BX5ZZKBKACTAV9WEVGEMMVRZ",
  source: "instagram",
  handle: "raphaelsalaja",
  label: null,
};

const labeled: AccountRef = {
  id: "01CN9ZZKBKACTAV9WEVGEMMVRZ",
  source: "youtube",
  handle: "UCabc",
  label: "Design talks",
  kind: "playlist",
};

describe("displayAccountToken", () => {
  it("uses @handle when that handle is unique", () => {
    expect(displayAccountToken(twitter.id, [twitter])).toBe("@raphaelsalaja");
  });

  it("qualifies with the source when two accounts share a handle", () => {
    const refs = [twitter, instagram];
    expect(displayAccountToken(twitter.id, refs)).toBe(
      "twitter/@raphaelsalaja",
    );
    expect(displayAccountToken(instagram.id, refs)).toBe(
      "instagram/@raphaelsalaja",
    );
  });

  it("prefers a nickname over an opaque playlist id", () => {
    expect(displayAccountToken(labeled.id, [labeled])).toBe("Design talks");
  });
});

describe("resolveAccountToken", () => {
  it("accepts a ULID, @handle, or source-qualified handle", () => {
    const refs = [twitter];
    expect(resolveAccountToken(twitter.id, refs)).toBe(
      twitter.id.toLowerCase(),
    );
    expect(resolveAccountToken("@raphaelsalaja", refs)).toBe(
      twitter.id.toLowerCase(),
    );
    expect(resolveAccountToken("twitter/@raphaelsalaja", refs)).toBe(
      twitter.id.toLowerCase(),
    );
  });

  it("leaves an ambiguous handle unresolved", () => {
    expect(resolveAccountToken("@raphaelsalaja", [twitter, instagram])).toBe(
      "@raphaelsalaja",
    );
  });
});

describe("accountChipLabel", () => {
  it("shows the handle next to the source name", () => {
    expect(accountChipLabel(twitter.id, [twitter])).toBe(
      "@raphaelsalaja · Twitter",
    );
  });
});

describe("accountDisplayName", () => {
  it("uses a nickname, then @handle, then the source name", () => {
    expect(accountDisplayName(labeled)).toBe("Design talks");
    expect(accountDisplayName(twitter)).toBe("@raphaelsalaja");
    expect(
      accountDisplayName({
        id: twitter.id,
        source: "twitter",
        handle: null,
        label: null,
      }),
    ).toBe("Twitter");
  });
});
