import { describe, expect, it, vi } from "vitest";
import {
  createWindowsUserSidResolver,
  nativeSocketPath,
  parseWindowsUserSid,
  safariSocketPath,
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

  it("keeps a sandbox off the installed app's Windows pipe", async () => {
    const sid = async () => "S-1-5-21-10-20-30-1001";
    const real = await nativeSocketPath("win32", sid, undefined);
    const sandbox = await nativeSocketPath("win32", sid, "C:\\Temp\\sandbox-a");
    expect(sandbox).not.toBe(real);
    expect(sandbox.startsWith(`${real}-sandbox-`)).toBe(true);
    await expect(
      nativeSocketPath("win32", sid, "C:\\Temp\\sandbox-b"),
    ).resolves.not.toBe(sandbox);
    await expect(
      nativeSocketPath("win32", sid, "C:\\Temp\\sandbox-a"),
    ).resolves.toBe(sandbox);
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
    await expect(
      nativeSocketPath("darwin", undefined, undefined, {}, "/Users/test"),
    ).resolves.toBe("/Users/test/Library/Application Support/Pond/native.sock");
  });

  it("prefers the XDG runtime directory on Linux", async () => {
    await expect(
      nativeSocketPath(
        "linux",
        undefined,
        undefined,
        { XDG_RUNTIME_DIR: "/run/user/1000", XDG_CONFIG_HOME: "/mnt/config" },
        "/home/test",
      ),
    ).resolves.toBe("/run/user/1000/pond/native.sock");
  });

  it("falls back to the XDG config root and then the home directory on Linux", async () => {
    await expect(
      nativeSocketPath(
        "linux",
        undefined,
        undefined,
        { XDG_CONFIG_HOME: "/mnt/config" },
        "/home/test",
      ),
    ).resolves.toBe("/mnt/config/pond/native.sock");
    await expect(
      nativeSocketPath("linux", undefined, undefined, {}, "/home/test"),
    ).resolves.toBe("/home/test/.config/pond/native.sock");
  });

  it("keeps a Linux sandbox off the installed app's socket", async () => {
    await expect(
      nativeSocketPath(
        "linux",
        undefined,
        "/tmp/pond-sandbox",
        { XDG_RUNTIME_DIR: "/run/user/1000" },
        "/home/test",
      ),
    ).resolves.toBe("/tmp/pond-sandbox/native.sock");
  });
});

describe("safariSocketPath", () => {
  it("binds inside the App Group container the Safari extension shares", () => {
    expect(safariSocketPath("/Users/koi")).toBe(
      "/Users/koi/Library/Group Containers/7VFLYD5292.so.pond/native.sock",
    );
  });

  it("fits a Unix socket address for a typical home folder", () => {
    expect(
      safariSocketPath("/Users/someone-with-a-long-name").length,
    ).toBeLessThan(104);
  });
});
