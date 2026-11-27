import { describe, expect, it } from "vitest";
import { captureDocumentTarget } from "./capture-target";

describe("captureDocumentTarget", () => {
  it("carries render metadata and the encoded handoff token in the navigation query", () => {
    const token = "token with spaces";
    const target = captureDocumentTarget("threads", "dark", 550, token);
    const query = new URLSearchParams(target.search);

    expect(target.token).toBe(token);
    expect(query.get("kind")).toBe("threads");
    expect(query.get("scheme")).toBe("dark");
    expect(query.get("w")).toBe("550");
    expect(query.get("card")).toBe(token);
    expect(target.search).toContain(`card=${encodeURIComponent(token)}`);
  });

  it("changes the navigation query when the handoff token changes", () => {
    const first = captureDocumentTarget("tweet", "light", 550, "token-first");
    const second = captureDocumentTarget("tweet", "light", 550, "token-second");

    expect(first.search).not.toBe(second.search);
  });
});
