import type { JsonObject } from "@pond/schema/json";
import { describe, expect, it } from "vitest";
import { cosmosAccessToken, refreshResultFromResponse } from "./access-token";
import type {
  CosmosRefreshResult,
  CosmosRefreshTrigger,
  CosmosTokenSource,
} from "./access-token";

const NOW_MS = Date.UTC(2026, 10, 27, 12);
const NOW_SEC = NOW_MS / 1000;

function jwtWith(payload: JsonObject): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

/** A session with a cookie and a refresh route that answers with `replies` in order. */
function sessionWith(
  cookie: string | null,
  replies: Array<CosmosRefreshResult>,
): CosmosTokenSource & {
  refreshes: Array<CosmosRefreshTrigger>;
  remembered: Array<string>;
} {
  const refreshes: Array<CosmosRefreshTrigger> = [];
  const remembered: Array<string> = [];
  return {
    refreshes,
    remembered,
    held: async () => [...(cookie ? [cookie] : []), ...remembered.slice(-1)],
    async refresh(trigger) {
      refreshes.push(trigger);
      return replies.shift() ?? { ok: false, reason: "transient" };
    },
    remember(accessToken) {
      remembered.push(accessToken);
    },
    now: () => NOW_MS,
  };
}

describe("cosmosAccessToken", () => {
  it("uses the session cookie while it has time left", async () => {
    const cookie = jwtWith({ eid: 42, exp: NOW_SEC + 3600 });
    const session = sessionWith(cookie, []);

    expect(await cosmosAccessToken(session)).toBe(cookie);
    expect(session.refreshes).toEqual([]);
  });

  it("refreshes a lapsed cookie instead of treating the Account as signed out", async () => {
    const lapsed = jwtWith({ eid: 42, exp: NOW_SEC - 600 });
    const fresh = jwtWith({ eid: 42, exp: NOW_SEC + 900 });
    const session = sessionWith(lapsed, [{ ok: true, accessToken: fresh }]);

    expect(await cosmosAccessToken(session)).toBe(fresh);
    expect(session.refreshes).toEqual(["proactive"]);

    expect(await cosmosAccessToken(session)).toBe(fresh);
    expect(session.refreshes).toEqual(["proactive"]);
  });

  it("refreshes a cookie that lapses within a minute", async () => {
    const closing = jwtWith({ eid: 42, exp: NOW_SEC + 30 });
    const fresh = jwtWith({ eid: 42, exp: NOW_SEC + 900 });
    const session = sessionWith(closing, [{ ok: true, accessToken: fresh }]);

    expect(await cosmosAccessToken(session)).toBe(fresh);
  });

  it("refreshes when there is no access token cookie at all", async () => {
    const fresh = jwtWith({ eid: 42, exp: NOW_SEC + 900 });
    const session = sessionWith(null, [{ ok: true, accessToken: fresh }]);

    expect(await cosmosAccessToken(session)).toBe(fresh);
  });

  it("forces a refresh after Cosmos rejects a token that looked current", async () => {
    const rejected = jwtWith({ eid: 42, exp: NOW_SEC + 3600 });
    const fresh = jwtWith({ eid: 42, exp: NOW_SEC + 900 });
    const session = sessionWith(rejected, [{ ok: true, accessToken: fresh }]);

    expect(await cosmosAccessToken(session, { force: true })).toBe(fresh);
    expect(session.refreshes).toEqual(["reactive"]);
  });

  it("reports a sign-out when the refresh is refused", async () => {
    const lapsed = jwtWith({ eid: 42, exp: NOW_SEC - 600 });
    const session = sessionWith(lapsed, [
      { ok: false, reason: "unauthorized" },
    ]);

    expect(await cosmosAccessToken(session)).toBeNull();
  });

  it("keeps a token that hasn't lapsed when the refresh fails in transit", async () => {
    const closing = jwtWith({ eid: 42, exp: NOW_SEC + 30 });
    const session = sessionWith(closing, [{ ok: false, reason: "transient" }]);

    expect(await cosmosAccessToken(session)).toBe(closing);
    expect(
      await cosmosAccessToken(
        sessionWith(closing, [{ ok: false, reason: "transient" }]),
        { force: true },
      ),
    ).toBeNull();
  });
});

describe("refreshResultFromResponse", () => {
  it("reads the new access token", () => {
    expect(refreshResultFromResponse(200, '{"accessToken":"abc"}')).toEqual({
      ok: true,
      accessToken: "abc",
    });
  });

  it("treats 401 as an ended session", () => {
    expect(refreshResultFromResponse(401, "")).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("treats other failures and odd bodies as transient", () => {
    expect(refreshResultFromResponse(502, "")).toEqual({
      ok: false,
      reason: "transient",
    });
    expect(refreshResultFromResponse(200, "<html>")).toEqual({
      ok: false,
      reason: "transient",
    });
    expect(refreshResultFromResponse(200, '{"accessToken":""}')).toEqual({
      ok: false,
      reason: "transient",
    });
  });
});
