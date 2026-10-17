import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chromiumNativeHostManifest,
  nativeHostFilename,
  WINDOWS_FIREFOX_REGISTRY_KEYS,
  WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS,
  windowsRegistryArgs,
  writeNativeHostManifests,
} from "./manifests";

const posix = (path: string) => path.replaceAll("\\", "/");

describe("native host manifests", () => {
  it("writes browser-specific manifests through the production operation", async () => {
    const home = "/Users/test";
    const hostPath = "/Applications/Pond.app/pond-native-host";
    const chromeParent = join(
      home,
      "Library/Application Support/Google/Chrome",
    );
    const firefoxParent = join(home, "Library/Application Support/Mozilla");
    const writes = new Map<string, string>();

    await writeNativeHostManifests({
      platform: "darwin",
      hostPath: () => hostPath,
      home: () => home,
      exists: (path) =>
        path === hostPath || path === chromeParent || path === firefoxParent,
      makeDirectory: () => {},
      writeFile: (path, body) => writes.set(path, body),
    });

    expect([...writes.values()].map((body) => JSON.parse(body))).toEqual([
      {
        name: "so.pond.host",
        description: "Pond",
        path: hostPath,
        type: "stdio",
        allowed_origins: [
          "chrome-extension://ihciihlcdkopghlpabpmnodncfdboplb/",
        ],
      },
      {
        name: "so.pond.host",
        description: "Pond",
        path: hostPath,
        type: "stdio",
        allowed_extensions: ["desktop@pond.so"],
      },
    ]);
  });

  it("registers Dia without a Chrome install", async () => {
    const writes: string[] = [];

    await writeNativeHostManifests({
      platform: "darwin",
      hostPath: () => "/Applications/Pond.app/pond-native-host",
      home: () => "/Users/test",
      exists: (path) =>
        posix(path) === "/Applications/Pond.app/pond-native-host" ||
        posix(path) === "/Users/test/Library/Application Support/Dia/User Data",
      makeDirectory: () => {},
      writeFile: (path) => writes.push(posix(path)),
    });

    expect(writes).toEqual([
      "/Users/test/Library/Application Support/Dia/User Data/NativeMessagingHosts/so.pond.host.json",
    ]);
  });

  it("registers Firefox before its support directory exists", async () => {
    const writes: string[] = [];

    await writeNativeHostManifests({
      platform: "darwin",
      hostPath: () => "/Applications/Pond.app/pond-native-host",
      home: () => "/Users/test",
      exists: (path) =>
        posix(path) === "/Applications/Pond.app/pond-native-host" ||
        posix(path) === "/Applications/Firefox.app",
      makeDirectory: () => {},
      writeFile: (path) => writes.push(posix(path)),
    });

    expect(writes).toEqual([
      "/Users/test/Library/Application Support/Mozilla/NativeMessagingHosts/so.pond.host.json",
    ]);
  });

  it("uses an executable host on Windows", () => {
    expect(nativeHostFilename("win32")).toBe("pond-native-host.exe");
    expect(nativeHostFilename("darwin")).toBe("pond-native-host");
  });

  it("registers the Chromium browsers supported on Windows", () => {
    expect(WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Google\\Chrome\\NativeMessagingHosts"),
        expect.stringContaining("Microsoft\\Edge\\NativeMessagingHosts"),
        expect.stringContaining("BraveSoftware\\Brave-Browser"),
      ]),
    );
  });

  it("removes every registered Windows key in the NSIS uninstaller", () => {
    const installer = readFileSync(
      new URL("../../../packaging/installer.nsh", import.meta.url),
      "utf8",
    );
    for (const key of [
      ...WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS,
      ...WINDOWS_FIREFOX_REGISTRY_KEYS,
    ]) {
      expect(installer).toContain(
        `DeleteRegKey HKCU "${key.replace("HKCU\\", "")}"`,
      );
    }
  });

  it("writes an absolute native messaging executable into the manifest", () => {
    expect(
      JSON.parse(
        chromiumNativeHostManifest(
          "C:\\Program Files\\Pond\\pond-native-host.exe",
        ),
      ),
    ).toMatchObject({
      path: "C:\\Program Files\\Pond\\pond-native-host.exe",
      type: "stdio",
    });
  });

  it("passes manifest paths with spaces as one registry argument", () => {
    const manifestPath =
      "C:\\Users\\A Person\\AppData\\Roaming\\Pond\\native-messaging\\so.pond.host.json";
    expect(
      windowsRegistryArgs(
        WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS[0],
        manifestPath,
      ),
    ).toContain(manifestPath);
  });

  it("registers a Chromium and a Firefox manifest on Windows", async () => {
    const writes = new Map<string, string>();
    const registry: string[][] = [];
    await writeNativeHostManifests({
      platform: "win32",
      hostPath: () => "C:\\Pond\\pond-native-host.exe",
      exists: () => true,
      userDataDirectory: () => "C:\\Users\\test\\AppData\\Roaming\\Pond",
      makeDirectory: () => {},
      writeFile: (path, body) => writes.set(path, body),
      runRegistry: async (args) => {
        registry.push(args);
      },
    });

    const chromiumPath = [...writes.keys()].find((path) =>
      path.endsWith("so.pond.host.json"),
    );
    const firefoxPath = [...writes.keys()].find((path) =>
      path.endsWith("so.pond.host.firefox.json"),
    );
    expect(chromiumPath).toBeDefined();
    expect(firefoxPath).toBeDefined();
    expect(JSON.parse(writes.get(chromiumPath ?? "") ?? "")).toMatchObject({
      allowed_origins: ["chrome-extension://ihciihlcdkopghlpabpmnodncfdboplb/"],
    });
    expect(JSON.parse(writes.get(firefoxPath ?? "") ?? "")).toMatchObject({
      allowed_extensions: ["desktop@pond.so"],
    });
    expect(registry).toHaveLength(
      WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS.length +
        WINDOWS_FIREFOX_REGISTRY_KEYS.length,
    );
    for (const key of WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS)
      expect(registry).toContainEqual(
        windowsRegistryArgs(key, chromiumPath ?? ""),
      );
    for (const key of WINDOWS_FIREFOX_REGISTRY_KEYS)
      expect(registry).toContainEqual(
        windowsRegistryArgs(key, firefoxPath ?? ""),
      );
    expect(WINDOWS_FIREFOX_REGISTRY_KEYS).toContain(
      "HKCU\\Software\\Mozilla\\NativeMessagingHosts\\so.pond.host",
    );
  });

  it("does not touch the registry on linux", async () => {
    const registry: string[][] = [];
    await writeNativeHostManifests({
      platform: "linux",
      runRegistry: async (args) => {
        registry.push(args);
      },
    });
    expect(registry).toEqual([]);
  });
});
