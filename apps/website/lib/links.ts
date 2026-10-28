export const SITE_URL = "https://pond.raphaelsalaja.com";

export const GITHUB_URL = "https://github.com/raphaelsalaja/pond";
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`;
export const TWITTER_URL = "https://x.com/raphaelsalaja";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/raphaelsalaja";
export const RESPONSIBLE_USE_URL = `${GITHUB_URL}/blob/main/RESPONSIBLE-USE.md`;
export const SECURITY_URL = `${GITHUB_URL}/blob/main/SECURITY.md`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const CONTRIBUTING_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;
export const API_DOCS_URL = `${GITHUB_URL}/blob/main/docs/api.md`;
export const RAYCAST_URL = `${GITHUB_URL}/tree/main/apps/raycast`;
export const ALFRED_URL = `${GITHUB_URL}/tree/main/apps/alfred`;
export const CLI_URL = `${GITHUB_URL}/tree/main/packages/cli`;
export const FORMATS_DOCS_URL = `${GITHUB_URL}/blob/main/docs/supported-formats.md`;
export const ROADMAP_URL = `${GITHUB_URL}/blob/main/ROADMAP.md`;

export interface SiteLink {
  label: string;
  href: string;
}

export const NAV_LINKS: SiteLink[] = [
  { label: "Sources", href: "/sources" },
  { label: "Fish", href: "/fish" },
  { label: "Developers", href: "/developers" },
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
];

export const FOOTER_GROUPS: { label: string; links: SiteLink[] }[] = [
  {
    label: "Product",
    links: [
      { label: "Download", href: "/download" },
      { label: "Sources", href: "/sources" },
      { label: "Fish", href: "/fish" },
      { label: "Changelog", href: "/changelog" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Developers", href: "/developers" },
      { label: "Shortcuts", href: "/integrations" },
      { label: "Formats", href: "/formats" },
      { label: "Brand", href: "/brand" },
    ],
  },
  {
    label: "Project",
    links: [
      { label: "GitHub", href: GITHUB_URL },
      { label: "Privacy", href: "/privacy" },
      { label: "Responsible Use", href: RESPONSIBLE_USE_URL },
      { label: "Security", href: SECURITY_URL },
      { label: "Buy Me a Coffee", href: BUY_ME_A_COFFEE_URL },
    ],
  },
];

export function isExternal(href: string): boolean {
  return href.startsWith("http");
}
