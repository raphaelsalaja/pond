import { describe, expect, it } from "vitest";
import { jsonResult, structuredResult } from "./results";

describe("mcp tool results", () => {
  it("flags an error body so hosts show a failed call", () => {
    const result = jsonResult({ error: "Save not found." });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: '{"error":"Save not found."}' },
    ]);
  });

  it("leaves successful bodies unflagged", () => {
    expect(jsonResult({ saves: [] }).isError).toBeUndefined();
  });

  it("mirrors structured content into text for older hosts", () => {
    const result = structuredResult({ total: 2 });
    expect(result.structuredContent).toEqual({ total: 2 });
    expect(result.content).toEqual([{ type: "text", text: '{"total":2}' }]);
  });

  it("drops structured content from errors", () => {
    const result = structuredResult({ error: "Busy." });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});
