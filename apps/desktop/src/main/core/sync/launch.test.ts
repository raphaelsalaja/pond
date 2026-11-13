import { DEFAULT_PREFS, type Prefs } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import { startLaunchSync } from "./launch";

function prefs(launch: boolean): Prefs {
  return { ...DEFAULT_PREFS, sync: { ...DEFAULT_PREFS.sync, launch } };
}

function deps(input: { launch: boolean; online?: boolean; blocked?: boolean }) {
  return {
    getPrefs: vi.fn(async () => prefs(input.launch)),
    isOnline: vi.fn(() => input.online ?? true),
    isBlocked: vi.fn(() => input.blocked ?? false),
    syncAll: vi.fn(async () => {}),
  };
}

describe("startLaunchSync", () => {
  it("does nothing while the preference is disabled", async () => {
    const d = deps({ launch: false });
    await expect(startLaunchSync(d)).resolves.toBe("disabled");
    expect(d.syncAll).not.toHaveBeenCalled();
  });

  it("does not start while offline or blocked by storage", async () => {
    const offline = deps({ launch: true, online: false });
    await expect(startLaunchSync(offline)).resolves.toBe("offline");
    expect(offline.syncAll).not.toHaveBeenCalled();

    const blocked = deps({ launch: true, blocked: true });
    await expect(startLaunchSync(blocked)).resolves.toBe("storage_blocked");
    expect(blocked.syncAll).not.toHaveBeenCalled();
  });

  it("starts one background global sync when enabled", async () => {
    const d = deps({ launch: true });
    await expect(startLaunchSync(d)).resolves.toBe("started");
    expect(d.syncAll).toHaveBeenCalledOnce();
  });
});
