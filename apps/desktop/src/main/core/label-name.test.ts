import { labelKey, normalizeLabelName } from "@pond/schema/label-name";
import { describe, expect, it } from "vitest";

describe("normalizeLabelName", () => {
  it("keeps accented and non-Latin letters", () => {
    expect(normalizeLabelName("Données")).toBe("Données");
    expect(normalizeLabelName("Donne\u0301es")).toBe("Données");
    expect(normalizeLabelName("  café / menu: v1.2-beta  ")).toBe(
      "café / menu: v1.2-beta",
    );
    expect(normalizeLabelName("数据")).toBe("数据");
    expect(normalizeLabelName("Привет")).toBe("Привет");
    expect(normalizeLabelName("مَرْحَبًا")).toBe("مَرْحَبًا");
    expect(normalizeLabelName("Ελλάδα")).toBe("Ελλάδα");
    expect(normalizeLabelName("日本語")).toBe("日本語");
    expect(normalizeLabelName("한글")).toBe("한글");
  });

  it("still drops symbols, a leading hash, and repeated spaces", () => {
    expect(normalizeLabelName("  ##  Données!!  ")).toBe("Données");
    expect(normalizeLabelName("tag_name")).toBe("tagname");
    expect(normalizeLabelName("hello@world")).toBe("helloworld");
    expect(normalizeLabelName("L'été")).toBe("Lété");
    expect(normalizeLabelName("Données ✨")).toBe("Données");
    expect(normalizeLabelName("!!!")).toBe("");
    expect(normalizeLabelName("a  b")).toBe("a b");
    expect(normalizeLabelName("group/label")).toBe("group/label");
    expect(normalizeLabelName("type: serif")).toBe("type: serif");
    expect(normalizeLabelName("v2.0")).toBe("v2.0");
    expect(normalizeLabelName("well-known")).toBe("well-known");
  });

  it("folds case without losing accents", () => {
    expect(labelKey("Données")).toBe("données");
    expect(labelKey("DONNÉES")).toBe(labelKey("Donne\u0301es"));
  });
});
