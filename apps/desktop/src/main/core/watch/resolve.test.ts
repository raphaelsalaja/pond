import { afterEach, expect, it, vi } from "vitest";
import { resolveWatchTarget } from "./resolve";

afterEach(() => vi.unstubAllGlobals());

it("does not guess an Are.na kind when the lookup is unavailable", async () => {
  vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
  await expect(resolveWatchTarget("arena", "example")).rejects.toThrow();
});

it("resolves an Are.na account after ruling out a channel", async () => {
  const paths: Array<string> = [];
  vi.stubGlobal("fetch", async (url: string) => {
    paths.push(new URL(url).pathname);
    return new Response(null, { status: url.includes("/users/") ? 200 : 404 });
  });
  expect(await resolveWatchTarget("arena", "example")).toEqual({
    kind: "user",
    handle: "example",
    display: "example",
  });
  expect(paths).toEqual(["/v3/channels/example", "/v3/users/example"]);
});
