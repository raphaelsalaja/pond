import { describe, expect, it } from "vitest";
import { parseSearchInput, serializePredicate } from "./syntax";

describe("sensitive search syntax", () => {
  it("parses and serializes confidence bands", () => {
    const parsed = parseSearchInput("sensitive:likely-sensitive");
    expect(parsed).toEqual({
      predicates: [
        {
          field: "sensitiveContent",
          operator: "eq",
          value: "likely-sensitive",
        },
      ],
      text: "",
    });
    const predicate = parsed.predicates[0];
    if (!predicate) throw new Error("Expected a sensitive predicate");
    expect(serializePredicate(predicate)).toBe("sensitive:likely-sensitive");
  });
});

describe("split post search syntax", () => {
  it("keeps the post key's case and colons", () => {
    const parsed = parseSearchInput("post:instagram:DAbC12 -post:x:9");
    expect(parsed.predicates).toEqual([
      { field: "post", operator: "eq", value: "instagram:DAbC12" },
      { field: "post", operator: "neq", value: "x:9" },
    ]);
    const [kept, dropped] = parsed.predicates;
    if (!kept || !dropped) throw new Error("Expected two post predicates");
    expect(serializePredicate(kept)).toBe("post:instagram:DAbC12");
    expect(serializePredicate(dropped)).toBe("-post:x:9");
  });
});
