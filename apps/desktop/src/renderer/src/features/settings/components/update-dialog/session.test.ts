import { afterEach, describe, expect, it } from "vitest";
import {
  dismissUpdateDialog,
  presentUpdateNotice,
  readUpdateDialog,
  requestUpdateCheck,
  type UpdateCheckClient,
} from "./session";

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
  dismissUpdateDialog();
});

describe("requestUpdateCheck", () => {
  it("confirms the installed version when nothing newer is published", async () => {
    requestUpdateCheck(client());
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "checking" },
    });
    await viWait();
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "current", version: "1.0.0" },
    });
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
    await viWait();
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "update", notice, explicit: true },
    });
  });

  it("offers Restart when the update is already downloaded", async () => {
    const notice = { phase: "downloaded" as const, version: "2.0.0" };
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: true, version: "2.0.0" }),
        currentNotice: async () => notice,
      }),
    );
    await viWait();
    expect(readUpdateDialog().view).toEqual({
      kind: "update",
      notice,
      explicit: true,
    });
  });

  it("explains a development build without offering a retry", async () => {
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: false, reason: "dev_build" }),
      }),
    );
    await viWait();
    expect(readUpdateDialog().view).toEqual({
      kind: "failed",
      message: "Updates are only available in packaged builds.",
      retry: false,
    });
  });

  it("keeps a failed check retryable", async () => {
    requestUpdateCheck(
      client({
        checkNow: async () => ({ ok: false, error: "Network unavailable" }),
      }),
    );
    await viWait();
    expect(readUpdateDialog().view).toEqual({
      kind: "failed",
      message: "Network unavailable",
      retry: true,
    });
  });

  it("ignores a second check while the first is still running", async () => {
    let checks = 0;
    let release: (value: { ok: true; version: string }) => void = () => {};
    const pending = new Promise<{ ok: true; version: string }>((resolve) => {
      release = resolve;
    });
    const shared = client({
      checkNow: () => {
        checks += 1;
        return pending;
      },
    });
    requestUpdateCheck(shared);
    requestUpdateCheck(shared);
    expect(checks).toBe(1);
    expect(readUpdateDialog().view).toEqual({ kind: "checking" });
    release({ ok: true, version: "1.0.0" });
    await viWait();
    expect(readUpdateDialog().view).toEqual({
      kind: "current",
      version: "1.0.0",
    });
  });

  it("does not reopen after the check is dismissed", async () => {
    let release: (value: { ok: true; version: string }) => void = () => {};
    const pending = new Promise<{ ok: true; version: string }>((resolve) => {
      release = resolve;
    });
    requestUpdateCheck(client({ checkNow: () => pending }));
    dismissUpdateDialog();
    release({ ok: true, version: "9.0.0" });
    await viWait();
    expect(readUpdateDialog().open).toBe(false);
  });
});

describe("presentUpdateNotice", () => {
  it("stays closed while an automatic download is running", () => {
    presentUpdateNotice({
      phase: "available",
      version: "2.0.0",
      downloading: true,
    });
    expect(readUpdateDialog().open).toBe(false);
  });

  it("still opens when an automatic download finishes", () => {
    const notice = { phase: "downloaded" as const, version: "2.0.0" };
    presentUpdateNotice(notice);
    expect(readUpdateDialog()).toEqual({
      open: true,
      view: { kind: "update", notice, explicit: false },
    });
  });

  it("updates an open check result when the download finishes", async () => {
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
    await viWait();
    const downloaded = { phase: "downloaded" as const, version: "2.0.0" };
    presentUpdateNotice(downloaded);
    expect(readUpdateDialog().view).toEqual({
      kind: "update",
      notice: downloaded,
      explicit: true,
    });
  });
});

function viWait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
