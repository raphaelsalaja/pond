import { describe, expect, it } from "vitest";
import { curlCommand, failureFor, parseCurl, shellQuote } from "./api";

describe("shellQuote", () => {
  it("escapes single quotes", () => {
    expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`);
  });
});

describe("curlCommand", () => {
  it("keeps the token out of argv", () => {
    const cmd = curlCommand("/library/search", { query: "red" });
    expect(cmd).toContain('"$POND_TOKEN"');
    expect(cmd).toContain("-K -");
    expect(cmd).toContain("'http://127.0.0.1:41610/api/v2/library/search'");
    expect(cmd).toContain(`--data-binary '{"query":"red"}'`);
  });

  it("quotes a query that would break out of the shell", () => {
    const cmd = curlCommand("/library/search", { query: "'; rm -rf ~; '" });
    expect(cmd).toContain(`--data-binary '{"query":"'\\''; rm -rf ~; '\\''"}'`);
  });
});

describe("parseCurl", () => {
  it("splits body and status", () => {
    expect(parseCurl('{"status":"success","data":{"saves":[]}}\n200')).toEqual({
      status: 200,
      body: { status: "success", data: { saves: [] } },
    });
  });

  it("keeps the status when the body isn't JSON", () => {
    expect(parseCurl("Bad Gateway\n502")).toEqual({ status: 502, body: null });
  });
});

describe("failureFor", () => {
  it("maps HTTP statuses to what the workflow shows", () => {
    expect(failureFor({ status: 200, body: null })).toBeNull();
    expect(failureFor({ status: 401, body: null })).toBe("unauthorized");
    expect(failureFor({ status: 403, body: null })).toBe("forbidden");
    expect(failureFor({ status: 500, body: null })).toBe("failed");
  });
});
