import { expect, it } from "vitest";
import { resolveWatchTarget } from "./resolve";
import type { FetchWatchPage } from "./types";

it("does not guess an Are.na kind when the lookup is unavailable", async () => {
  const unavailable: FetchWatchPage = async () =>
    new Response(null, { status: 503 });
  await expect(
    resolveWatchTarget("arena", "example", unavailable),
  ).rejects.toThrow();
});

it("resolves an Are.na account after ruling out a channel", async () => {
  const paths: Array<string> = [];
  const fetchPage: FetchWatchPage = async (url) => {
    paths.push(new URL(url).pathname);
    return new Response(null, { status: url.includes("/users/") ? 200 : 404 });
  };
  expect(await resolveWatchTarget("arena", "example", fetchPage)).toEqual({
    kind: "user",
    handle: "example",
    display: "example",
  });
  expect(paths).toEqual(["/v3/channels/example", "/v3/users/example"]);
});
