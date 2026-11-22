import type { Browser, Platform } from "./platform";

const REPO = "raphaelsalaja/pond";
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

export interface Release {
  tag: string;
  assets: string[];
}

/** GitHub's latest release skips drafts and prereleases, so links never point at a build that isn't out yet. */
export async function getLatestRelease(): Promise<Release | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      tag_name: string;
      assets: { name: string }[];
    };
    return {
      tag: body.tag_name,
      assets: body.assets.map((asset) => asset.name),
    };
  } catch {
    return null;
  }
}

/** Releases before 2.7.0 name the x64 Linux builds without an arch. */
const BUILDS = {
  mac: /-arm64\.dmg$/,
  intelMac: /-x64\.dmg$/,
  windows: /-x64\.exe$/,
  linux: /^Pond-[\d.]+(-x64)?\.AppImage$/,
  linuxArm: /-arm64\.AppImage$/,
  deb: /^Pond-[\d.]+(-x64)?\.deb$/,
  debArm: /-arm64\.deb$/,
} as const;

type Build = keyof typeof BUILDS;

function buildUrl(release: Release | null, build: Build): string | null {
  const name = release?.assets.find((asset) => BUILDS[build].test(asset));
  return release && name
    ? `${RELEASES_PAGE}/download/${release.tag}/${name}`
    : null;
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
export function primaryDownload(
  platform: Platform,
  release: Release | null,
): Download {
  const [label, build]: [string, Build] =
    platform === "windows"
      ? ["Download for Windows", "windows"]
      : platform === "linux"
        ? ["Download for Linux", "linux"]
        : ["Download for Mac", "mac"];
  return { label, href: buildUrl(release, build) ?? RELEASES_PAGE };
}

const SECONDARY: Record<Platform, [string, Build][]> = {
  mac: [
    ["Intel Mac", "intelMac"],
    ["Windows", "windows"],
    ["Linux", "linux"],
    ["Linux (ARM)", "linuxArm"],
  ],
  windows: [
    ["Mac", "mac"],
    ["Intel Mac", "intelMac"],
    ["Linux", "linux"],
    ["Linux (ARM)", "linuxArm"],
  ],
  linux: [
    ["Mac", "mac"],
    ["Intel Mac", "intelMac"],
    ["Windows", "windows"],
    ["Debian package", "deb"],
    ["Linux (ARM)", "linuxArm"],
    ["Debian package (ARM)", "debArm"],
  ],
};

/** Every other build the release ships, listed as secondary links. */
export function otherDownloads(
  platform: Platform,
  release: Release | null,
): Download[] {
  return SECONDARY[platform].flatMap(([label, build]) => {
    const href = buildUrl(release, build);
    return href ? [{ label, href }] : [];
  });
}
