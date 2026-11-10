import type { Browser, Platform } from "./platform";

/** Keep in sync with apps/desktop and apps/extension package versions on each release. */
const POND_VERSION = "2.6.0";

const RELEASES_PAGE = "https://github.com/raphaelsalaja/pond/releases";
const RELEASES_BASE = `${RELEASES_PAGE}/latest/download`;

/**
 * The Linux port merged after v2.2.2 was tagged, so that release has no Linux
 * assets and its download links 404. The first release that includes them is
 * the first version at or above this one.
 */
const FIRST_LINUX_VERSION = "2.2.3";
/** The first release that ships the arm64 Linux build; earlier ones are x64 only. */
const FIRST_LINUX_ARM_VERSION = "2.6.0";

const LINUX_AVAILABLE = isAtLeast(POND_VERSION, FIRST_LINUX_VERSION);
const LINUX_ARM_AVAILABLE = isAtLeast(POND_VERSION, FIRST_LINUX_ARM_VERSION);

function isAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const current = parse(version);
  const target = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) !== (target[index] ?? 0)) {
      return (current[index] ?? 0) > (target[index] ?? 0);
    }
  }
  return true;
}

function dmgUrl(arch: "arm64" | "x64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.dmg`;
}

function windowsInstallerUrl(): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-x64.exe`;
}

/** The x64 AppImage runs on every x86_64 distribution, so it is the default Linux build. */
function linuxAppImageUrl(arch: "x64" | "arm64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.AppImage`;
}

function linuxDebUrl(arch: "x64" | "arm64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.deb`;
}

/** Hardcoded because importing `CHROME_WEB_STORE_ID` from `@pond/schema/native` would pull zod into this client bundle. */
const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc";
const FIREFOX_ADDONS_URL =
  "https://addons.mozilla.org/firefox/addon/desktop%40pond.so/";

export function extensionUrl(browser: Browser): string {
  return browser === "firefox" ? FIREFOX_ADDONS_URL : CHROME_WEB_STORE_URL;
}

interface Download {
  label: string;
  href: string;
}

/** The download offered first, matched to the visitor's system. */
export function primaryDownload(platform: Platform): Download {
  if (platform === "windows") {
    return { label: "Download for Windows", href: windowsInstallerUrl() };
  }
  if (platform === "linux") {
    return LINUX_AVAILABLE
      ? { label: "Download for Linux", href: linuxAppImageUrl("x64") }
      : { label: "Linux build coming soon", href: RELEASES_PAGE };
  }
  return { label: "Download for Mac", href: dmgUrl("arm64") };
}

/** Every other build, listed as secondary links. */
export function otherDownloads(platform: Platform): Download[] {
  const mac: Download = { label: "Mac", href: dmgUrl("arm64") };
  const intelMac: Download = { label: "Intel Mac", href: dmgUrl("x64") };
  const windows: Download = {
    label: "Windows",
    href: windowsInstallerUrl(),
  };
  const linux: Download[] = LINUX_AVAILABLE
    ? [{ label: "Linux", href: linuxAppImageUrl("x64") }]
    : [];
  const linuxArm: Download[] =
    LINUX_ARM_AVAILABLE && platform !== "linux"
      ? [{ label: "Linux (ARM)", href: linuxAppImageUrl("arm64") }]
      : [];

  if (platform === "windows") return [mac, intelMac, ...linux, ...linuxArm];
  if (platform === "linux") {
    return [
      mac,
      intelMac,
      windows,
      ...(LINUX_AVAILABLE
        ? [{ label: "Debian package", href: linuxDebUrl("x64") }]
        : []),
      ...(LINUX_ARM_AVAILABLE
        ? [
            { label: "Linux (ARM)", href: linuxAppImageUrl("arm64") },
            { label: "Debian package (ARM)", href: linuxDebUrl("arm64") },
          ]
        : []),
    ];
  }
  return [intelMac, windows, ...linux, ...linuxArm];
}
