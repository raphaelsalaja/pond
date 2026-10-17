/** Keep in sync with apps/desktop and apps/extension package versions on each release. */
const POND_VERSION = "1.0.1";

const RELEASES_BASE =
  "https://github.com/raphaelsalaja/pond/releases/latest/download";

export function dmgUrl(arch: "arm64" | "x64"): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-${arch}.dmg`;
}

export function windowsInstallerUrl(): string {
  return `${RELEASES_BASE}/Pond-${POND_VERSION}-x64.exe`;
}

export function extensionZipUrl(): string {
  return `${RELEASES_BASE}/pond-extension-${POND_VERSION}.zip`;
}
