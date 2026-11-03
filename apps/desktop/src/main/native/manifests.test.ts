import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHROMIUM_EXTENSION_IDS,
  EXTENSION_ID,
  EXTENSION_KEY,
} from "@pond/schema/native";
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
          "chrome-extension://ghigndnldiagchoaifgndleogpkendbc/",
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
    expect(nativeHostFilename("linux")).toBe("pond-native-host");
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

  it("registers every Windows key in the NSIS installer against the userData manifests", () => {
    const installer = readFileSync(
      new URL("../../../packaging/installer.nsh", import.meta.url),
      "utf8",
    );
    expect(installer).toContain(
      `!define POND_NMH_DIR "$APPDATA\\\${PRODUCT_NAME}\\native-messaging"`,
    );
    const registrations = [
      ...WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS.map((key) => ({
        key,
        manifest: "so.pond.host.json",
      })),
      ...WINDOWS_FIREFOX_REGISTRY_KEYS.map((key) => ({
        key,
        manifest: "so.pond.host.firefox.json",
      })),
    ];
    for (const { key, manifest } of registrations) {
      expect(installer).toContain(
        `WriteRegStr HKCU "${key.replace("HKCU\\", "")}" "" "\${POND_NMH_DIR}\\${manifest}"`,
      );
    }
  });

  it("leaves the registry to the installer in a packaged Windows app", async () => {
    const writes: string[] = [];
    const registry: string[][] = [];
    await writeNativeHostManifests({
      platform: "win32",
      hostPath: () => "C:\\Pond\\pond-native-host.exe",
      exists: () => true,
      userDataDirectory: () => "C:\\Users\\test\\AppData\\Roaming\\Pond",
      makeDirectory: () => {},
      writeFile: (path) => writes.push(path),
      installerRegistersKeys: () => true,
      runRegistry: async (args) => {
        registry.push(args);
      },
    });

    expect(writes.map((path) => path.split(/[\\/]/).pop())).toEqual([
      "so.pond.host.json",
      "so.pond.host.firefox.json",
    ]);
    expect(registry).toEqual([]);
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
      installerRegistersKeys: () => false,
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
      allowed_origins: [
        "chrome-extension://ihciihlcdkopghlpabpmnodncfdboplb/",
        "chrome-extension://ghigndnldiagchoaifgndleogpkendbc/",
      ],
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

  it("writes browser manifests on Linux without touching the registry", async () => {
    const writes = new Map<string, string>();
    const registry: string[][] = [];
    const hostPath = "/home/test/.local/share/Pond/bin/pond-native-host";
    const configHome = "/home/test/.config";

    await writeNativeHostManifests({
      platform: "linux",
      hostPath: () => hostPath,
      home: () => "/home/test",
      environment: { XDG_CONFIG_HOME: configHome },
      exists: (path) =>
        path === hostPath ||
        path === join(configHome, "google-chrome") ||
        path === join(configHome, "BraveSoftware/Brave-Browser") ||
        path === join(configHome, "BraveSoftware/Brave-Origin") ||
        path === "/home/test/.var/app/com.google.Chrome/config/google-chrome" ||
        path === "/home/test/.mozilla" ||
        path === "/home/test/.var/app/org.mozilla.firefox/.mozilla",
      makeDirectory: () => {},
      writeFile: (path, body) => writes.set(posix(path), body),
      runRegistry: async (args) => {
        registry.push(args);
      },
    });

    expect(registry).toEqual([]);
    expect([...writes.keys()]).toEqual([
      `${configHome}/google-chrome/NativeMessagingHosts/so.pond.host.json`,
      `${configHome}/BraveSoftware/Brave-Browser/NativeMessagingHosts/so.pond.host.json`,
      `${configHome}/BraveSoftware/Brave-Origin/NativeMessagingHosts/so.pond.host.json`,
      "/home/test/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/so.pond.host.json",
      "/home/test/.mozilla/native-messaging-hosts/so.pond.host.json",
      "/home/test/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/so.pond.host.json",
    ]);
    expect(
      JSON.parse(
        writes.get(
          `${configHome}/google-chrome/NativeMessagingHosts/so.pond.host.json`,
        ) ?? "",
      ),
    ).toMatchObject({
      name: "so.pond.host",
      path: hostPath,
      allowed_origins: CHROMIUM_EXTENSION_IDS.map(
        (id) => `chrome-extension://${id}/`,
      ),
    });
    expect(
      JSON.parse(
        writes.get(
          "/home/test/.mozilla/native-messaging-hosts/so.pond.host.json",
        ) ?? "",
      ),
    ).toMatchObject({ allowed_extensions: ["desktop@pond.so"] });
  });

  it("uses the XDG config root on Linux", async () => {
    const writes: string[] = [];

    await writeNativeHostManifests({
      platform: "linux",
      hostPath: () => "/home/test/.local/share/Pond/bin/pond-native-host",
      home: () => "/home/test",
      environment: { XDG_CONFIG_HOME: "/mnt/config" },
      exists: (path) =>
        path === "/home/test/.local/share/Pond/bin/pond-native-host" ||
        path === "/mnt/config/chromium",
      makeDirectory: () => {},
      writeFile: (path) => writes.push(posix(path)),
    });

    expect(writes).toEqual([
      "/mnt/config/chromium/NativeMessagingHosts/so.pond.host.json",
    ]);
  });

  it("allows the extension ID that the pinned manifest key derives", () => {
    const digest = createHash("sha256")
      .update(Buffer.from(EXTENSION_KEY, "base64"))
      .digest("hex")
      .slice(0, 32);
    const derived = [...digest]
      .map((hex) => String.fromCharCode(97 + Number.parseInt(hex, 16)))
      .join("");
    expect(derived).toBe(EXTENSION_ID);
    expect(
      JSON.parse(chromiumNativeHostManifest("/host")).allowed_origins,
    ).toEqual(CHROMIUM_EXTENSION_IDS.map((id) => `chrome-extension://${id}/`));
    expect(CHROMIUM_EXTENSION_IDS).toContain(derived);
  });
});
