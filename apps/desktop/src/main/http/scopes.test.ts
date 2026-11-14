import { describe, expect, it } from "vitest";
import { routeAccess } from "./scopes";

describe("routeAccess", () => {
  it.each([
    ["GET", "/api/v2/library/info", "search"],
    ["GET", "/api/v2/library/tags", "search"],
    ["POST", "/api/v2/library/query", "search"],
    ["POST", "/api/v2/library/search", "search"],
    ["GET", "/api/v2/saves/get", "search"],
    ["POST", "/api/v2/saves/get", "search"],
    ["GET", "/api/v2/saves/thumb", "search"],
    ["HEAD", "/api/v2/saves/file", "search"],
    ["GET", "/api/v2/library/conversion/capabilities", "export"],
    ["GET", "/api/v2/library/conversion/job-1", "export"],
    ["POST", "/api/v2/library/conversion/start", "export"],
    ["POST", "/api/v2/library/conversion/job-1/cancel", "export"],
    ["POST", "/api/v2/enqueue", "write"],
    ["POST", "/api/v2/saves/tags", "write"],
    ["POST", "/api/v2/saves/trash", "write"],
    ["POST", "/api/v2/saves/rating", "write"],
    ["POST", "/api/v2/saves/favorite", "write"],
  ])("%s %s needs %s", (method, path, access) => {
    expect(routeAccess(method, path)).toBe(access);
  });

  it.each([
    ["GET", "/api/v2/library/recent"],
    ["POST", "/api/v2/library/switch"],
    ["GET", "/api/v2/operations"],
    ["POST", "/api/v2/operations/run"],
    ["POST", "/api/v2/session/import"],
    ["GET", "/api/v2/session/pending"],
    ["POST", "/api/v2/library/info"],
    ["GET", "/api/v2/saves/tags"],
    ["GET", "/api/v2/saves/unknown"],
    ["GET", "/api/v2saves/get"],
  ])("keeps %s %s private", (method, path) => {
    expect(routeAccess(method, path)).toBe("internal");
  });
});
