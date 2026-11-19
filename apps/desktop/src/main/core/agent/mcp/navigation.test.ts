import { describe, expect, it } from "vitest";
import { AppNavigationSchema } from "../../../../shared/app-navigation";
import { applyFilterInput } from "../tools";

describe("app navigation", () => {
  it("accepts every filter the apply_filter tool accepts", () => {
    const { query } = applyFilterInput.parse({
      query: {
        combinator: "and",
        rules: [
          { field: "source", operator: "eq", value: "twitter" },
          {
            combinator: "or",
            not: true,
            rules: [{ field: "tags", operator: "some", value: ["poster"] }],
          },
        ],
      },
    });
    const target = AppNavigationSchema.parse({ kind: "filter", query });
    expect(target).toMatchObject({ kind: "filter", query });
  });

  it("rejects a Save without an id", () => {
    const result = AppNavigationSchema.safeParse({ kind: "save", id: "" });
    expect(result.success).toBe(false);
  });
});
