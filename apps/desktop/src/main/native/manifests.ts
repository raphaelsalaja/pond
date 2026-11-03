import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import {
  CHROMIUM_EXTENSION_IDS,
  FIREFOX_EXTENSION_ID,
  NATIVE_HOST_NAME,
} from "@pond/schema/native";
import { app } from "electron";
import log from "electron-log/main.js";
import { prepareNativeHostBinary } from "./host-binary";

const HOST_FILENAME = `${NATIVE_HOST_NAME}.json`;
const FIREFOX_HOST_FILENAME = `${NATIVE_HOST_NAME}.firefox.json`;
const execFileAsync = promisify(execFile);

const CHROMIUM_NMH_DIRS = [
  "Library/Application Support/Google/Chrome/NativeMessagingHosts",
  "Library/Application Support/Google/Chrome Canary/NativeMessagingHosts",
  "Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts",
  "Library/Application Support/Chromium/NativeMessagingHosts",
  "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
  "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
  "Library/Application Support/Arc/User Data/NativeMessagingHosts",
  "Library/Application Support/Dia/User Data/NativeMessagingHosts",
  "Library/Application Support/Vivaldi/NativeMessagingHosts",
] as const;

const FIREFOX_NMH_TARGETS = [
  {
    dir: "Library/Application Support/Mozilla/NativeMessagingHosts",
    apps: [
      "Firefox.app",
      "Firefox Developer Edition.app",
      "Firefox Nightly.app",
    ],
  },
  {
    dir: "Library/Application Support/zen/NativeMessagingHosts",
    apps: ["Zen.app", "Zen Browser.app"],
  },
  {
    dir: "Library/Application Support/Zen/NativeMessagingHosts",
    apps: ["Zen.app", "Zen Browser.app"],
  },
  {
    dir: "Library/Application Support/LibreWolf/NativeMessagingHosts",
    apps: ["LibreWolf.app"],
  },
  {
    dir: "Library/Application Support/Floorp/NativeMessagingHosts",
    apps: ["Floorp.app"],
  },
] as const;

/**
 * Chromium browsers read per-user manifests from their config directory on
 * Linux. Snap and Flatpak builds keep their own config roots, so each one is
 * listed separately; a target is only written when its browser directory
 * exists.
 */
const LINUX_CHROMIUM_CONFIG_DIRS = [
  "google-chrome",
  "google-chrome-beta",
  "google-chrome-unstable",
  "chromium",
  "ungoogled-chromium",
  "BraveSoftware/Brave-Browser",
  "BraveSoftware/Brave-Browser-Beta",
  "BraveSoftware/Brave-Browser-Nightly",
  "BraveSoftware/Brave-Origin",
  "microsoft-edge",
  "microsoft-edge-beta",
  "microsoft-edge-dev",
  "vivaldi",
] as const;

function linuxConfigHome(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const config = env.XDG_CONFIG_HOME;
  return config && isAbsolute(config) ? config : join(home, ".config");
}

/** Flatpak browsers read from their sandbox's own config root. */
const LINUX_CHROMIUM_FLATPAK_DIRS = [
  "org.chromium.Chromium/config/chromium",
  "com.google.Chrome/config/google-chrome",
  "com.brave.Browser/config/BraveSoftware/Brave-Browser",
  "com.microsoft.Edge/config/microsoft-edge",
  "com.vivaldi.Vivaldi/config/vivaldi",
] as const;

function linuxChromiumNativeHostDirs(input: {
  home: string;
  configHome: string;
}): string[] {
  return [
    ...LINUX_CHROMIUM_CONFIG_DIRS.map((browser) =>
      join(input.configHome, browser, "NativeMessagingHosts"),
    ),
    ...LINUX_CHROMIUM_FLATPAK_DIRS.map((dir) =>
      join(input.home, ".var/app", dir, "NativeMessagingHosts"),
    ),
    join(input.home, "snap/chromium/common/chromium/NativeMessagingHosts"),
  ];
}

/** Firefox reads a single per-user directory; forks and packaged builds each have their own. */
function linuxFirefoxNativeHostDirs(input: { home: string }): string[] {
  return [
    join(input.home, ".mozilla/native-messaging-hosts"),
    join(input.home, ".zen/native-messaging-hosts"),
    join(input.home, ".librewolf/native-messaging-hosts"),
    join(input.home, ".floorp/native-messaging-hosts"),
    join(input.home, "snap/firefox/common/.mozilla/native-messaging-hosts"),
    join(
      input.home,
      ".var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts",
    ),
    join(input.home, "snap/zen/common/.zen/native-messaging-hosts"),
    join(
      input.home,
      ".var/app/app.zen_browser.zen/.zen/native-messaging-hosts",
    ),
    join(
      input.home,
      ".var/app/io.github.zen_browser.zen/.zen/native-messaging-hosts",
    ),
  ];
}

export const WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Google\\Chrome SxS\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
] as const;

/** Zen reads Firefox's key; the other forks keep their own. */
export const WINDOWS_FIREFOX_REGISTRY_KEYS = [
  `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\LibreWolf\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  `HKCU\\Software\\Floorp\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
] as const;

export function nativeHostFilename(platform: NodeJS.Platform): string {
  return platform === "win32" ? "pond-native-host.exe" : "pond-native-host";
}

function nativeHostBinaryPath(
  platform: NodeJS.Platform = process.platform,
): string {
  const filename = nativeHostFilename(platform);
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", filename);
  }
  const candidates = [
    join(app.getAppPath(), "resources", "bin", filename),
    join(app.getAppPath(), "..", "resources", "bin", filename),
    join(process.cwd(), "resources", "bin", filename),
  ];
  const found = candidates.find((p) => existsSync(p));
  return found ?? join(process.cwd(), "resources", "bin", filename);
}

export function windowsRegistryArgs(
  key: string,
  manifestPath: string,
): string[] {
  return ["ADD", key, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"];
}

function hostManifest(
  hostPath: string,
  allow: { allowed_origins: string[] } | { allowed_extensions: string[] },
): string {
  return `${JSON.stringify(
    {
      name: NATIVE_HOST_NAME,
      description: "Pond",
      path: hostPath,
      type: "stdio",
      ...allow,
    },
    null,
    2,
  )}\n`;
}

export function chromiumNativeHostManifest(hostPath: string): string {
  return hostManifest(hostPath, {
    allowed_origins: CHROMIUM_EXTENSION_IDS.map(
      (id) => `chrome-extension://${id}/`,
    ),
  });
}

function firefoxNativeHostManifest(hostPath: string): string {
  return hostManifest(hostPath, {
    allowed_extensions: [FIREFOX_EXTENSION_ID],
  });
}

interface NativeHostManifestDependencies {
  platform: NodeJS.Platform;
  hostPath: () => string | Promise<string>;
  home: () => string;
  environment: NodeJS.ProcessEnv;
  exists: (path: string) => boolean;
  makeDirectory: (path: string) => void;
  writeFile: (path: string, body: string) => void;
  warn: (...values: unknown[]) => void;
  userDataDirectory: () => string;
  /** The NSIS installer writes the registry keys, so a packaged app never spawns reg.exe, which antivirus flags. */
  installerRegistersKeys: () => boolean;
  runRegistry: (args: string[]) => Promise<void>;
}

const defaultDependencies: NativeHostManifestDependencies = {
  platform: process.platform,
  hostPath: () =>
    prepareNativeHostBinary({
      source: nativeHostBinaryPath(),
      packaged: app.isPackaged,
      appImage: process.env.APPIMAGE,
    }),
  home: homedir,
  environment: process.env,
  exists: existsSync,
  makeDirectory: (path) => mkdirSync(path, { recursive: true }),
  writeFile: (path, body) => writeFileSync(path, body, { encoding: "utf8" }),
  warn: (...values) => log.warn(...values),
  userDataDirectory: () => app.getPath("userData"),
  installerRegistersKeys: () => app.isPackaged,
  runRegistry: async (args) => {
    await execFileAsync("reg.exe", args, {
      windowsHide: true,
      timeout: 5_000,
      killSignal: "SIGKILL",
    });
  },
};

export async function writeNativeHostManifests(
  overrides: Partial<NativeHostManifestDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  if (
    dependencies.platform !== "darwin" &&
    dependencies.platform !== "win32" &&
    dependencies.platform !== "linux"
  ) {
    return;
  }

  const hostPath = await dependencies.hostPath();
  if (!dependencies.exists(hostPath)) {
    dependencies.warn("[pond native] host binary missing", hostPath);
    return;
  }

  if (dependencies.platform === "win32") {
    await writeWindowsNativeHostManifest(hostPath, dependencies);
    return;
  }

  if (dependencies.platform === "linux") {
    writeLinuxNativeHostManifests(hostPath, dependencies);
    return;
  }

  const home = dependencies.home();
  const targets = [
    ...CHROMIUM_NMH_DIRS.map((dir) => ({
      dir,
      apps: [],
      body: chromiumNativeHostManifest(hostPath),
    })),
    ...FIREFOX_NMH_TARGETS.map((target) => ({
      ...target,
      body: firefoxNativeHostManifest(hostPath),
    })),
  ];
  for (const { dir: relativeDirectory, apps, body } of targets) {
    const parent = join(home, relativeDirectory, "..");
    const installed = apps.some(
      (name) =>
        dependencies.exists(join("/Applications", name)) ||
        dependencies.exists(join(home, "Applications", name)),
    );
    if (!dependencies.exists(parent) && !installed) continue;
    const dir = join(home, relativeDirectory);
    try {
      dependencies.makeDirectory(dir);
      dependencies.writeFile(join(dir, HOST_FILENAME), body);
    } catch (err) {
      dependencies.warn(
        "[pond native] failed to write host manifest",
        dir,
        err,
      );
    }
  }
}

function writeLinuxNativeHostManifests(
  hostPath: string,
  dependencies: NativeHostManifestDependencies,
): void {
  const home = dependencies.home();
  const targets = [
    ...linuxChromiumNativeHostDirs({
      home,
      configHome: linuxConfigHome(dependencies.environment, home),
    }).map((dir) => ({
      dir,
      body: chromiumNativeHostManifest(hostPath),
    })),
    ...linuxFirefoxNativeHostDirs({ home }).map((dir) => ({
      dir,
      body: firefoxNativeHostManifest(hostPath),
    })),
  ];
  for (const { dir, body } of targets) {
    /** The browser creates its own config root on first launch, so that directory is the install signal. */
    if (!dependencies.exists(dirname(dir))) continue;
    try {
      dependencies.makeDirectory(dir);
      dependencies.writeFile(join(dir, HOST_FILENAME), body);
    } catch (err) {
      dependencies.warn(
        "[pond native] failed to write host manifest",
        dir,
        err,
      );
    }
  }
}

async function writeWindowsNativeHostManifest(
  hostPath: string,
  dependencies: NativeHostManifestDependencies,
): Promise<void> {
  const dir = join(dependencies.userDataDirectory(), "native-messaging");
  /** Chromium and Firefox reject each other's allow-list field, so each family gets its own manifest. */
  const targets = [
    {
      manifestPath: join(dir, HOST_FILENAME),
      body: chromiumNativeHostManifest(hostPath),
      keys: WINDOWS_NATIVE_MESSAGING_REGISTRY_KEYS,
    },
    {
      manifestPath: join(dir, FIREFOX_HOST_FILENAME),
      body: firefoxNativeHostManifest(hostPath),
      keys: WINDOWS_FIREFOX_REGISTRY_KEYS,
    },
  ];
  for (const { manifestPath, body, keys } of targets) {
    try {
      dependencies.makeDirectory(dir);
      dependencies.writeFile(manifestPath, body);
    } catch (err) {
      dependencies.warn(
        "[pond native] failed to write host manifest",
        manifestPath,
        err,
      );
      continue;
    }

    if (dependencies.installerRegistersKeys()) continue;
    await Promise.all(
      keys.map(async (key) => {
        try {
          await dependencies.runRegistry(
            windowsRegistryArgs(key, manifestPath),
          );
        } catch (err) {
          dependencies.warn(
            "[pond native] failed to register host manifest",
            key,
            err,
          );
        }
      }),
    );
  }
}
