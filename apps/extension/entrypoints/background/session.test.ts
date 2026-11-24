import type { Source } from "@pond/schema/source-ids";
import { afterEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { startSessionConnect, startSessionFollow } from "./session";
import type { SessionApi } from "./session";

type CookieListener = Parameters<SessionApi["onCookieChanged"]>[0];

afterEach(() => {
  vi.useRealTimers();
  fakeBrowser.reset();
});

it("keeps every missed Source when a cookie changes during startup", async () => {
  vi.useFakeTimers();
  let cookieListener: CookieListener | undefined;
  let releaseFirst: (() => void) | undefined;
  const firstRequest = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const requests: Array<Source> = [];
  const api: SessionApi = {
    getCookies: async () => [],
    onCookieChanged: (listener) => {
      cookieListener = listener;
    },
    nativeCall: async (request) => {
      if (request.type !== "session.refresh") {
        throw new Error("Unexpected native request");
      }
      requests.push(request.source);
      if (requests.length === 1) {
        await firstRequest;
      }
      return { ok: false, error: "offline" };
    },
  };

  startSessionFollow(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toEqual(["twitter"]);
  if (!cookieListener) {
    throw new Error("Cookie listener was not registered");
  }
  cookieListener({
    removed: false,
    cause: "explicit",
    cookie: {
      domain: ".github.com",
      name: "user_session",
      value: "changed",
      path: "/",
      hostOnly: false,
      httpOnly: true,
      secure: true,
      sameSite: "unspecified",
      session: false,
      storeId: "0",
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(requests).toEqual(["twitter"]);

  releaseFirst?.();
  await vi.advanceTimersByTimeAsync(0);

  expect(await fakeBrowser.storage.session.get("sessionFollow")).toEqual({
    sessionFollow: { missed: ["twitter", "github", "youtube"], untracked: [] },
  });
  expect(requests).toEqual(["twitter", "github", "github", "youtube"]);
});

it("keeps a newly connected Source tracked during a pending refresh", async () => {
  vi.useFakeTimers();
  await fakeBrowser.storage.session.set({
    sessionFollow: { missed: [], untracked: ["github"] },
  });
  let releaseFirst: (() => void) | undefined;
  const firstRequest = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const refreshed: Array<Source> = [];
  const imported = vi.fn();
  const connected = vi.fn();
  const api: SessionApi = {
    getCookies: async () => [],
    onCookieChanged: () => {},
    nativeCall: async (request) => {
      if (request.type === "session.pending") {
        return { ok: true, data: { source: "github" } };
      }
      if (request.type === "session.import") {
        imported();
        return {
          ok: true,
          data: { ok: true, imported: 1, connected: true, accountId: "github" },
        };
      }
      if (request.type !== "session.refresh") {
        throw new Error("Unexpected native request");
      }
      refreshed.push(request.source);
      if (request.source === "twitter") {
        await firstRequest;
      }
      return { ok: true, data: { tracked: true, refreshed: true } };
    },
  };

  startSessionFollow(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(refreshed).toEqual(["twitter"]);
  startSessionConnect(connected, api);
  await vi.advanceTimersByTimeAsync(0);
  expect(imported).toHaveBeenCalledOnce();
  expect(connected).not.toHaveBeenCalled();

  releaseFirst?.();
  await vi.advanceTimersByTimeAsync(0);

  expect(connected).toHaveBeenCalledOnce();
  expect(refreshed).toEqual(["twitter", "github", "youtube"]);
  expect(await fakeBrowser.storage.session.get("sessionFollow")).toEqual({
    sessionFollow: { missed: [], untracked: [] },
  });
});
