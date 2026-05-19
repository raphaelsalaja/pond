import { SECTIONS } from "@/pages/settings/registry";
import type { Save } from "@/pool/types";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Library",
  "/untagged": "Untagged",
  "/recents": "Recents",
  "/random": "Random",
  "/trash": "Trash",
  "/activity": "Activity",
  "/settings": "Settings",
  "/welcome": "Welcome",
};

const SOURCE_LABELS: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  pinterest: "Pinterest",
  github: "GitHub",
  arena: "Are.na",
  cosmos: "Cosmos",
};

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}

function prettySource(slug: string): string {
  return SOURCE_LABELS[slug] ?? titleCase(slug);
}

export function extractSaveId(path: string): string | null {
  const clean = path.split("?")[0]!;
  const detail = clean.match(/\/detail\/([^/?]+)/);
  if (detail) return detail[1]!;
  return null;
}

// `/save/:id` is a split-pane companion segment — the tab is still
// the parent view (Library, Twitter, Untagged, …) with a save selected
// in the inspector. Drop the suffix before resolving label/icon so the
// tab identity doesn't flip every time you click a card.
export function stripSaveSplit(path: string): string {
  const m = path.match(/^(.*?)\/save\/[^/?]+(\?.*)?$/);
  if (!m) return path;
  const base = m[1] || "/";
  const search = m[2] ?? "";
  return base + search;
}

export function settingsSectionLabel(path: string): string | null {
  const m = path.match(/^\/settings\/([^/?]+)/);
  if (!m) return null;
  return SECTIONS.find((s) => s.path === m[1])?.label ?? null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function saveLabel(save: Save): string {
  const title = save.title?.trim();
  if (title) return title;
  if (save.url) {
    const host = hostnameOf(save.url);
    if (host) return host;
    return save.url;
  }
  return "Untitled save";
}

export function labelForPath(path: string): string {
  const clean = stripSaveSplit(path).split("?")[0]!;

  const exact = ROUTE_LABELS[clean];
  if (exact) return exact;

  const section = settingsSectionLabel(clean);
  if (section) return section;

  if (clean.startsWith("/source/")) {
    const source = clean.split("/")[2];
    return source ? prettySource(source) : "Source";
  }
  if (extractSaveId(clean)) return "Save";

  return "Tab";
}

export function computeLabel(path: string, save: Save | undefined): string {
  if (save) return saveLabel(save);
  return labelForPath(path);
}
