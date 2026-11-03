import type { Browser, Platform } from "./platform";

/** Keep in sync with apps/desktop and apps/extension package versions on each release. */
const POND_VERSION = "2.2.1";

const RELEASES_BASE =
  "https://github.com/raphaelsalaja/pond/releases/latest/download";

function dmgUrl(arch: "arm64" | "x64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.dmg`;
}

function windowsInstallerUrl(): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-x64.exe`;
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
  return platform === "windows"
    ? { label: "Download for Windows", href: windowsInstallerUrl() }
    : { label: "Download for Mac", href: dmgUrl("arm64") };
}

/** Every other build, listed as secondary links. */
export function otherDownloads(platform: Platform): Download[] {
  return platform === "windows"
    ? [
        { label: "Mac", href: dmgUrl("arm64") },
        { label: "Intel Mac", href: dmgUrl("x64") },
      ]
    : [
        { label: "Intel Mac", href: dmgUrl("x64") },
        { label: "Windows", href: windowsInstallerUrl() },
      ];
}
