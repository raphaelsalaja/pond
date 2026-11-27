import { describe, expect, it } from "vitest";
import {
  captureDocumentTarget,
  capturedCardToken,
  documentReloads,
} from "./capture-target";

interface SharedDocument {
  search: string;
  token: string;
  ready: boolean;
}

/** The capture window is one document. A navigation that does not reload leaves the previous card up. */
function shootBatch(
  tokens: ReadonlyArray<string>,
  scheme = "light",
): Array<string | null> {
  let document: SharedDocument | null = null;
  return tokens.map((token) => {
    const target = captureDocumentTarget("tweet", scheme, 550, token);
    if (documentReloads(document, target)) {
      document = { search: target.search, token: target.token, ready: true };
    }
    return capturedCardToken(document, target.token);
  });
}

describe("shared tweet card window", () => {
  it("reloads when two saves in one batch ask for the same scheme", () => {
    const first = captureDocumentTarget("tweet", "light", 550, "token-first");
    const second = captureDocumentTarget("tweet", "light", 550, "token-second");

    expect(first.search).not.toBe(second.search);
    expect(documentReloads({ search: first.search }, second)).toBe(true);
  });

  it("does not keep the previous save's card when renders share one window", () => {
    const shots = shootBatch(["token-a", "token-b", "token-c"]);

    expect(shots.every((shot) => shot !== null)).toBe(true);
    expect(new Set(shots).size).toBe(shots.length);
  });

  it("refuses a ready document that still holds another save's token", () => {
    const requested = captureDocumentTarget("tweet", "dark", 550, "save-b");
    expect(
      capturedCardToken(
        { token: "previous-save", ready: true },
        requested.token,
      ),
    ).toBeNull();
    expect(
      capturedCardToken(
        { token: requested.token, ready: false },
        requested.token,
      ),
    ).toBeNull();
    expect(
      capturedCardToken(
        { token: requested.token, ready: true },
        requested.token,
      ),
    ).toBe(requested.token);
  });
});
