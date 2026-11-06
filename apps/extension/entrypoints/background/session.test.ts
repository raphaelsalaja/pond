import { nativeRequestSchema } from "@pond/schema/native";
import type { Source } from "@pond/schema/source-ids";
import { afterEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { startSessionConnect, startSessionFollow } from "./session";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

it("keeps every missed Source when a cookie changes during startup", async () => {
  vi.useFakeTimers();
  type CookieListener = Parameters<
    typeof browser.cookies.onChanged.addListener
  >[0];
  let cookieListener: CookieListener | undefined;
  let releaseFirst: (() => void) | undefined;
  const firstRequest = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const requests: Source[] = [];
  vi.spyOn(fakeBrowser.cookies, "getAll").mockImplementation(async () => []);
  vi.spyOn(fakeBrowser.cookies.onChanged, "addListener").mockImplementation(
    (listener: CookieListener) => {
      cookieListener = listener;
    },
  );
  vi.spyOn(fakeBrowser.runtime, "sendNativeMessage").mockImplementation(
    async (_host, message) => {
      const request = nativeRequestSchema.parse(message);
      if (request.type !== "session.refresh") {
        throw new Error("Unexpected native request");
      }
      requests.push(request.source);
      if (requests.length === 1) await firstRequest;
      return { ok: false, error: "offline" };
    },
  );

  startSessionFollow();
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toEqual(["twitter"]);
  if (!cookieListener) throw new Error("Cookie listener was not registered");
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
  await vi.advanceTimersByTimeAsync(5_000);
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
  const refreshed: Source[] = [];
  const imported = vi.fn();
  const connected = vi.fn();
  vi.spyOn(fakeBrowser.cookies, "getAll").mockImplementation(async () => []);
  vi.spyOn(fakeBrowser.cookies.onChanged, "addListener").mockImplementation(
    () => {},
  );
  vi.spyOn(fakeBrowser.runtime, "sendNativeMessage").mockImplementation(
    async (_host, message) => {
      const request = nativeRequestSchema.parse(message);
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
      if (request.source === "twitter") await firstRequest;
      return { ok: true, data: { tracked: true, refreshed: true } };
    },
  );

  startSessionFollow();
  await vi.advanceTimersByTimeAsync(0);
  expect(refreshed).toEqual(["twitter"]);
  startSessionConnect(connected);
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
