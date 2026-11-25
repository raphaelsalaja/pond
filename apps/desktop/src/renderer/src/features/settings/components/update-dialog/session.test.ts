import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissUpdateDialog,
  openUpdateOverlay,
  presentUpdateNotice,
  readUpdateDialog,
  readUpdateNotice,
  requestUpdateCheck,
  updateNoticeStore,
} from "./session";
import type { UpdateCheckClient } from "./session";

const current = { version: "1.0.0" };

function client(overrides: Partial<UpdateCheckClient> = {}): UpdateCheckClient {
  return {
    appInfo: async () => current,
    checkNow: async () => ({ ok: true, version: "1.0.0" }),
    currentNotice: async () => null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  dismissUpdateDialog();
  updateNoticeStore.setState(() => null);
});

describe("requestUpdateCheck", () => {
  it("confirms the installed version when nothing newer is published", async () => {
    requestUpdateCheck(client());
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "checking" },
    });
    await vi.waitFor(() =>
      expect(readUpdateDialog()).toEqual({
        open: true,
        view: { kind: "current", version: "1.0.0" },
      }),
    );
  });

  it("opens the update dialog immediately when a newer build is already downloading", async () => {
    const notice = {
      phase: "available" as const,
      version: "2.0.0",
      downloading: true,
    };
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: true, version: "2.0.0" }),
        currentNotice: async () => notice,
      }),
    );
    await vi.waitFor(() =>
      expect(readUpdateDialog()).toEqual({
        open: true,
        view: { kind: "update", notice },
      }),
    );
  });

  it("offers Restart when the update is already downloaded", async () => {
    const notice = { phase: "downloaded" as const, version: "2.0.0" };
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: true, version: "2.0.0" }),
        currentNotice: async () => notice,
      }),
    );
    await vi.waitFor(() =>
      expect(readUpdateDialog().view).toEqual({ kind: "update", notice }),
    );
  });

  it("explains a development build without offering a retry", async () => {
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: false, reason: "dev_build" }),
      }),
    );
    await vi.waitFor(() =>
      expect(readUpdateDialog().view).toEqual({
        kind: "failed",
        message: "Updates are only available in packaged builds.",
        retry: false,
      }),
    );
  });

  it("keeps a failed check retryable", async () => {
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: false, error: "Network unavailable" }),
      }),
    );
    await vi.waitFor(() =>
      expect(readUpdateDialog().view).toEqual({
        kind: "failed",
        message: "Network unavailable",
        retry: true,
      }),
    );
  });

  it("ignores a second check while the first is still running", async () => {
    let checks = 0;
    const pending = Promise.withResolvers<{ ok: true; version: string }>();
    const shared = client({
      checkNow: () => {
        checks += 1;
        return pending.promise;
      },
    });
    requestUpdateCheck(shared);
    requestUpdateCheck(shared);
    expect(checks).toBe(1);
    expect(readUpdateDialog().view).toEqual({ kind: "checking" });
    pending.resolve({ ok: true, version: "1.0.0" });
    await vi.waitFor(() =>
      expect(readUpdateDialog().view).toEqual({
        kind: "current",
        version: "1.0.0",
      }),
    );
  });

  it("does not reopen after the check is dismissed", async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<{ ok: true; version: string }>();
    requestUpdateCheck(client({ checkNow: () => pending.promise }));
    dismissUpdateDialog();
    pending.resolve({ ok: true, version: "9.0.0" });
    await vi.runAllTimersAsync();
    expect(readUpdateDialog().open).toBe(false);
  });
});

describe("presentUpdateNotice", () => {
  it("keeps the overlay closed and hands a background notice to the sidebar", () => {
    const notice = { phase: "downloaded" as const, version: "2.0.0" };
    presentUpdateNotice(notice);
    expect(readUpdateDialog().open).toBe(false);
    expect(readUpdateNotice()).toEqual(notice);
  });

  it("updates an open check result as the download progresses and finishes", async () => {
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: true, version: "2.0.0" }),
        currentNotice: async () => ({
          phase: "available",
          version: "2.0.0",
          downloading: true,
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(readUpdateDialog().view).toEqual({
        kind: "update",
        notice: { phase: "available", version: "2.0.0", downloading: true },
      }),
    );
    const progressing = {
      phase: "available" as const,
      version: "2.0.0",
      downloading: true,
      progress: 0.5,
    };
    presentUpdateNotice(progressing);
    expect(readUpdateDialog().view).toEqual({
      kind: "update",
      notice: progressing,
    });
    const downloaded = { phase: "downloaded" as const, version: "2.0.0" };
    presentUpdateNotice(downloaded);
    expect(readUpdateDialog().view).toEqual({
      kind: "update",
      notice: downloaded,
    });
  });
});

describe("openUpdateOverlay", () => {
  it("shows the pending update without checking again", () => {
    let checks = 0;
    const notice = { phase: "downloaded" as const, version: "2.0.0" };
    presentUpdateNotice(notice);
    openUpdateOverlay(
      client({
        checkNow: async () => {
          checks += 1;
          return { ok: true, version: "2.0.0" };
        },
      }),
    );
    expect(checks).toBe(0);
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "update", notice },
    });
  });

  it("checks when nothing is pending", () => {
    openUpdateOverlay(client());
    expect(readUpdateDialog().view).toEqual({ kind: "checking" });
  });
});
