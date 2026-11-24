import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openSafariSettings,
  parsePluginkit,
  safariExtensionStatus,
} from "./safari-extension";
import type {
  RunCommand,
  SafariExtensionStatus,
  SafariSettingsModule,
} from "./safari-extension";

/**
 * Verbatim shape from macOS 27: one tab-separated line per plug-in, marker column first,
 * path last, then a trailing count line.
 */
const TABBED = `     so.pond.desktop.Extension(1.0)\t4DF645BD-2409-472F-B617-55E9ECF69E48\t2026-10-27 05:26:11 +0000\t/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
  (1 plug-in)`;

const TABBED_ENABLED = TABBED.replace("     so.pond", "+    so.pond");

/** Older builds print the properties on their own indented lines. */
const MULTILINE = `+    so.pond.desktop.Extension(1.0)
               Path = /Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
        Parent Bundle = /Applications/Pond.app`;

describe("parsePluginkit", () => {
  it("reads the tab-separated form macOS prints", () => {
    expect(parsePluginkit(TABBED)).toEqual([
      {
        id: "so.pond.desktop.Extension",
        enabled: false,
        path: "/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex",
      },
    ]);
  });

  it("treats a leading + as enabled", () => {
    const [entry] = parsePluginkit(TABBED_ENABLED);
    expect(entry?.enabled).toBe(true);
    expect(entry?.id).toBe("so.pond.desktop.Extension");
  });

  it("ignores the plug-in count trailer", () => {
    expect(parsePluginkit(TABBED)).toHaveLength(1);
  });

  it("reads the indented property form too", () => {
    const [entry] = parsePluginkit(MULTILINE);
    expect(entry?.enabled).toBe(true);
    expect(entry?.path).toBe(
      "/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex",
    );
  });

  it("returns nothing for empty output", () => {
    expect(parsePluginkit("")).toEqual([]);
  });

  it("keeps several extensions apart", () => {
    const both = `${TABBED_ENABLED}\n${TABBED.replace("so.pond.desktop.Extension", "com.example.Other")}`;
    const parsed = parsePluginkit(both);
    expect(parsed.map((entry) => entry.id)).toEqual([
      "so.pond.desktop.Extension",
      "com.example.Other",
    ]);
    expect(parsed.map((entry) => entry.enabled)).toEqual([true, false]);
  });
});

const BUNDLE_ID = "so.pond.desktop.Extension";

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.Safari.web-extension</string>
  </dict>
</dict></plist>`;

/**
 * Verbatim `codesign -dvv` reports from macOS 27, trimmed to the lines that differ.
 * codesign prints them on stderr, even when it exits 0.
 */
const DEVELOPER_ID_REPORT = `Executable=/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex/Contents/MacOS/Pond Extension
Identifier=so.pond.desktop.Extension
Format=bundle with Mach-O universal (x86_64 arm64)
Authority=Developer ID Application: Raphael Salaja (7VFLYD5292)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=7VFLYD5292`;

const AD_HOC_REPORT = `Identifier=so.pond.desktop.Extension
CodeDirectory v=20400 size=263 flags=0x2(adhoc) hashes=2+2 location=embedded
Signature=adhoc
TeamIdentifier=not set`;

const UNSIGNED_REPORT =
  "Pond Extension.appex: code object is not signed at all";

/** Safari's reply when the caller is not the main process of the app holding the extension. */
const SAFARI_REFUSED =
  "The operation couldn’t be completed. (SFErrorDomain error 1.)";

/** Rejects the way `execFile` does when a command exits non-zero. */
function failure(stderr: string): Error {
  return Object.assign(new Error(`Command failed\n${stderr}`), {
    code: 1,
    stdout: "",
    stderr,
  });
}

type Reply = { stdout?: string; stderr?: string } | { fail: Error };

/**
 * Stands in for the commands the module runs. Each command name maps to its reply; an
 * unlisted command fails like a missing binary. Calls are recorded for assertions.
 */
function commands(replies: Record<string, Reply>) {
  const calls: Array<{ command: string; args: Array<string> }> = [];
  const run: RunCommand = async (command, args) => {
    calls.push({ command, args });
    const name = command.split("/").at(-1) ?? command;
    const reply = replies[name];
    if (!reply) {
      throw Object.assign(new Error(`spawn ${command} ENOENT`), {
        code: "ENOENT",
      });
    }
    if ("fail" in reply) {
      throw reply.fail;
    }
    return { stdout: reply.stdout ?? "", stderr: reply.stderr ?? "" };
  };
  return { run, calls };
}

const roots: Array<string> = [];

/**
 * A Pond.app on disk with the appex in Contents/PlugIns and, when given, these bytes as
 * `Contents/Resources/safari-settings.node`.
 */
function packagedApp({ settingsModule }: { settingsModule?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pond-safari-"));
  roots.push(root);
  const contents = join(root, "Pond.app", "Contents");
  const appex = join(contents, "PlugIns", "Pond Extension.appex", "Contents");
  mkdirSync(appex, { recursive: true });
  writeFileSync(join(appex, "Info.plist"), INFO_PLIST);
  mkdirSync(join(contents, "Resources"), { recursive: true });
  if (settingsModule !== undefined) {
    writeFileSync(
      join(contents, "Resources", "safari-settings.node"),
      settingsModule,
    );
  }
  return { resourcesPath: join(contents, "Resources") };
}

/** Stands in for safari-settings.node, answering every request the same way. */
function settingsModule(answer: () => Promise<void>) {
  const requests: Array<string> = [];
  const settings: SafariSettingsModule = {
    async showPreferences(identifier) {
      requests.push(identifier);
      return answer();
    },
  };
  return { settings, requests };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("safariExtensionStatus", () => {
  it("recognizes a Developer ID build from the report codesign prints on stderr", async () => {
    const { resourcesPath } = packagedApp();
    const { run } = commands({
      codesign: { stderr: DEVELOPER_ID_REPORT },
      pluginkit: { stdout: TABBED },
    });
    expect(
      await safariExtensionStatus({ platform: "darwin", resourcesPath, run }),
    ).toEqual({
      state: "disabled",
      bundleId: BUNDLE_ID,
      signature: "developer-id",
    });
  });

  it("recognizes an ad hoc build", async () => {
    const { resourcesPath } = packagedApp();
    const { run } = commands({
      codesign: { stderr: AD_HOC_REPORT },
      pluginkit: { stdout: TABBED_ENABLED },
    });
    expect(
      await safariExtensionStatus({ platform: "darwin", resourcesPath, run }),
    ).toEqual({ state: "enabled", bundleId: BUNDLE_ID, signature: "ad-hoc" });
  });

  it("does not call an unsigned appex ad hoc", async () => {
    const { resourcesPath } = packagedApp();
    const { run } = commands({
      codesign: { fail: failure(UNSIGNED_REPORT) },
      pluginkit: { fail: failure("") },
    });
    expect(
      await safariExtensionStatus({ platform: "darwin", resourcesPath, run }),
    ).toEqual({
      state: "not_registered",
      bundleId: BUNDLE_ID,
      signature: "unknown",
    });
  });

  it("does not guess the signature when codesign is missing", async () => {
    const { resourcesPath } = packagedApp();
    const { run } = commands({ pluginkit: { stdout: TABBED } });
    const status = await safariExtensionStatus({
      platform: "darwin",
      resourcesPath,
      run,
    });
    expect(status.signature).toBe("unknown");
  });

  it("reports no appex off macOS without running anything", async () => {
    const { resourcesPath } = packagedApp();
    const { run, calls } = commands({});
    expect(
      await safariExtensionStatus({ platform: "win32", resourcesPath, run }),
    ).toEqual({ state: "not_bundled", bundleId: null, signature: "unknown" });
    expect(calls).toEqual([]);
  });
});

const DISABLED: SafariExtensionStatus = {
  state: "disabled",
  bundleId: BUNDLE_ID,
  signature: "developer-id",
};

describe("openSafariSettings", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks Safari for the appex's own bundle ID", async () => {
    const { settings, requests } = settingsModule(async () => {});
    expect(
      await openSafariSettings(DISABLED, { platform: "darwin", settings }),
    ).toEqual({ ok: true });
    expect(requests).toEqual([BUNDLE_ID]);
  });

  it("reports a build without the settings module", async () => {
    const { resourcesPath } = packagedApp();
    const result = await openSafariSettings(DISABLED, {
      platform: "darwin",
      resourcesPath,
    });
    expect(result).toMatchObject({ ok: false, reason: "helper-missing" });
  });

  it("treats a module that will not load as missing", async () => {
    const { resourcesPath } = packagedApp({
      settingsModule: "not a Mach-O bundle",
    });
    const result = await openSafariSettings(DISABLED, {
      platform: "darwin",
      resourcesPath,
    });
    expect(result).toMatchObject({ ok: false, reason: "helper-missing" });
  });

  it("keeps Safari's error code out of the message on a signed build", async () => {
    const { settings } = settingsModule(async () => {
      throw new Error(SAFARI_REFUSED);
    });
    const result = await openSafariSettings(DISABLED, {
      platform: "darwin",
      settings,
    });
    expect(result).toMatchObject({ ok: false, reason: "safari-refused" });
    expect(result.ok ? "" : result.error).not.toContain("SFErrorDomain");
    expect(result.ok ? "" : result.error).not.toContain("unsigned");
  });

  it("points an ad hoc build at Safari's unsigned extensions setting", async () => {
    const { settings } = settingsModule(async () => {
      throw new Error(SAFARI_REFUSED);
    });
    const result = await openSafariSettings(
      { ...DISABLED, signature: "ad-hoc" },
      { platform: "darwin", settings },
    );
    expect(result).toMatchObject({ ok: false, reason: "unsigned-build" });
    expect(result.ok ? "" : result.error).not.toContain("SFErrorDomain");
  });

  it("gives up when Safari never answers", async () => {
    vi.useFakeTimers();
    const { settings } = settingsModule(() => new Promise(() => {}));
    const pending = openSafariSettings(DISABLED, {
      platform: "darwin",
      settings,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({
      ok: false,
      reason: "safari-refused",
    });
  });

  it("does nothing for a build without the appex", async () => {
    const { settings, requests } = settingsModule(async () => {});
    const result = await openSafariSettings(
      { state: "not_bundled", bundleId: null, signature: "unknown" },
      { platform: "darwin", settings },
    );
    expect(result).toMatchObject({ ok: false, reason: "not-bundled" });
    expect(requests).toEqual([]);
  });

  it("does nothing off macOS", async () => {
    const { settings, requests } = settingsModule(async () => {});
    const result = await openSafariSettings(DISABLED, {
      platform: "linux",
      settings,
    });
    expect(result).toMatchObject({ ok: false, reason: "unsupported" });
    expect(requests).toEqual([]);
  });
});
