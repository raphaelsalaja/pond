import { describe, expect, it, vi } from "vitest";
import {
  createWindowsUserSidResolver,
  nativeSocketPath,
  parseWindowsUserSid,
  WINDOWS_SID_LOOKUP_TIMEOUT_MS,
  windowsNativePipePath,
} from "./paths";

describe("nativeSocketPath", () => {
  it("uses the host contract's named pipe on Windows", async () => {
    await expect(
      nativeSocketPath("win32", async () => "S-1-5-21-10-20-30-1001"),
    ).resolves.toBe(
      String.raw`\\.\pipe\pond-native-host-S-1-5-21-10-20-30-1001`,
    );
  });

  it("parses the SID from whoami CSV output", () => {
    expect(
      parseWindowsUserSid('"DESKTOP\\Person","S-1-5-21-10-20-30-1001"\r\n'),
    ).toBe("S-1-5-21-10-20-30-1001");
    expect(() => parseWindowsUserSid('"DESKTOP\\Person","not-a-sid"')).toThrow(
      "current Windows user SID",
    );
  });

  it("isolates native pipes by Windows user SID", () => {
    expect(windowsNativePipePath("S-1-5-21-1-1001")).not.toBe(
      windowsNativePipePath("S-1-5-21-1-1002"),
    );
    expect(() => windowsNativePipePath("person")).toThrow(
      "Invalid Windows user SID",
    );
  });

  it("deduplicates concurrent SID lookups and caches successful results", async () => {
    const gate = Promise.withResolvers<string>();
    const load = vi.fn(() => gate.promise);
    const resolveSid = createWindowsUserSidResolver(load);
    const first = nativeSocketPath("win32", resolveSid);
    const second = nativeSocketPath("win32", resolveSid);
    expect(load).toHaveBeenCalledOnce();
    gate.resolve("S-1-5-21-10-20-30-1001");
    await expect(Promise.all([first, second])).resolves.toEqual([
      String.raw`\\.\pipe\pond-native-host-S-1-5-21-10-20-30-1001`,
      String.raw`\\.\pipe\pond-native-host-S-1-5-21-10-20-30-1001`,
    ]);
    await expect(nativeSocketPath("win32", resolveSid)).resolves.toBe(
      String.raw`\\.\pipe\pond-native-host-S-1-5-21-10-20-30-1001`,
    );
    expect(load).toHaveBeenCalledOnce();
  });

  it("clears a timed-out in-flight lookup so a retry can recover", async () => {
    const timedOut = Promise.withResolvers<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(timedOut.promise)
      .mockResolvedValueOnce("S-1-5-21-10-20-30-1001");
    const resolveSid = createWindowsUserSidResolver(load);
    const first = resolveSid();
    const second = resolveSid();
    expect(load).toHaveBeenCalledOnce();
    timedOut.reject(new Error("whoami timed out"));
    await expect(first).rejects.toThrow("whoami timed out");
    await expect(second).rejects.toThrow("whoami timed out");
    await expect(resolveSid()).resolves.toBe("S-1-5-21-10-20-30-1001");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bounds the operating-system SID lookup", () => {
    expect(WINDOWS_SID_LOOKUP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(WINDOWS_SID_LOOKUP_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("keeps the macOS Application Support socket", async () => {
    await expect(nativeSocketPath("darwin")).resolves.toMatch(
      /Library[\\/]Application Support[\\/]Pond[\\/]native\.sock$/,
    );
  });
});
