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

/** The capture window is one document. A hash-only load leaves the previous card up. */
function shootBatch(
  payloads: readonly string[],
  scheme = "light",
): Array<string | null> {
  let document: SharedDocument | null = null;
  return payloads.map((payload) => {
    const target = captureDocumentTarget("tweet", scheme, 550, payload);
    if (documentReloads(document, target)) {
      document = { search: target.search, token: target.token, ready: true };
    }
    return capturedCardToken(document, target.token);
  });
}

describe("shared tweet card window", () => {
  it("reloads when two saves in one batch ask for the same scheme", () => {
    const first = captureDocumentTarget(
      "tweet",
      "light",
      550,
      JSON.stringify({ text: "first save" }),
    );
    const second = captureDocumentTarget(
      "tweet",
      "light",
      550,
      JSON.stringify({ text: "second save" }),
    );

    expect(first.search).not.toBe(second.search);
    expect(documentReloads({ search: first.search }, second)).toBe(true);
    expect(first.hash).not.toBe(second.hash);
  });

  it("does not keep the previous save's card when renders share one window", () => {
    const shots = shootBatch([
      JSON.stringify({ id: "save-a", media: "image-a" }),
      JSON.stringify({ id: "save-b", media: "image-b" }),
      JSON.stringify({ id: "save-c", media: "video-c" }),
    ]);

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
