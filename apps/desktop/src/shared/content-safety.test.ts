import {
  isManualSensitiveDecision,
  manualSensitiveDecision,
  sensitiveContentBand,
} from "@pond/schema/content-safety";
import { describe, expect, it } from "vitest";

describe("sensitive content bands", () => {
  it("maps scores without discarding model confidence", () => {
    expect(sensitiveContentBand(null)).toBe("not-checked");
    expect(sensitiveContentBand(0.49)).toBe("not-sensitive");
    expect(sensitiveContentBand(0.5)).toBe("possible-sensitive");
    expect(sensitiveContentBand(0.8)).toBe("likely-sensitive");
  });

  it("stores a correction the classifier can recognize", () => {
    const cleared = manualSensitiveDecision(false);
    const marked = manualSensitiveDecision(true);
    expect(sensitiveContentBand(cleared.sensitiveScore)).toBe("not-sensitive");
    expect(sensitiveContentBand(marked.sensitiveScore)).toBe(
      "likely-sensitive",
    );
    expect(isManualSensitiveDecision(cleared.sensitiveModel)).toBe(true);
    expect(isManualSensitiveDecision(marked.sensitiveModel)).toBe(true);
    expect(isManualSensitiveDecision("onnx-community/model@revision")).toBe(
      false,
    );
  });

  it("treats invalid scores as unchecked", () => {
    expect(sensitiveContentBand(Number.NaN)).toBe("not-checked");
    expect(sensitiveContentBand(-1)).toBe("not-checked");
    expect(sensitiveContentBand(2)).toBe("not-checked");
  });
});
