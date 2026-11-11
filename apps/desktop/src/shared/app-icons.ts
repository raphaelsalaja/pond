import { DEFAULT_APP_ICON } from "@pond/schema/db";
import type { LibraryMarkSource } from "./library-mark";

export { DEFAULT_APP_ICON };

const APP_ICON_ORDER = [
  DEFAULT_APP_ICON,
  "maraschino",
  "tangerine",
  "lemon",
  "lime",
  "spring",
  "sea-foam",
  "turquoise",
  "blueberry",
  "grape",
  "magenta",
  "strawberry",
  "mocha",
  "asparagus",
  "fern",
  "clover",
  "moss",
  "teal",
  "plum",
] as const;

const APP_ICON_TINT = new Map<string, string>(
  Object.entries({
    aqua: "#59a6fc",
    maraschino: "#f46950",
    tangerine: "#f7ab51",
    blueberry: "#435dfc",
    grape: "#9952fb",
    strawberry: "#f35ca2",
    mocha: "#aa7f4d",
    asparagus: "#adab56",
    fern: "#83aa54",
    clover: "#69ac57",
    moss: "#65a97e",
    teal: "#62a9ab",
    plum: "#a558aa",
  }),
);

export function appIconTint(id: string): string | undefined {
  return APP_ICON_TINT.get(id);
}

export function appIconLabel(id: string): string {
  return id
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

interface AppIconPrefs {
  appIcon: string;
  appIconMatchesLibrary: boolean;
}

interface LibraryLogo {
  icon: string | null;
  mark: LibraryMarkSource | null;
}

/** A Library without a logo shows the default Pond logo, so matching it means the default tint. */
export function preferredAppIcon(
  prefs: AppIconPrefs,
  logo: LibraryLogo | null,
): string {
  if (!prefs.appIconMatchesLibrary || !logo) return prefs.appIcon;
  if (logo.icon === null) return DEFAULT_APP_ICON;
  return logo.mark?.kind === "pond" ? logo.mark.tint : prefs.appIcon;
}

export function resolveAppIconId(
  raw: string | null | undefined,
  available: ReadonlySet<string>,
): string {
  if (raw && available.has(raw)) return raw;
  if (available.has(DEFAULT_APP_ICON)) return DEFAULT_APP_ICON;
  return available.values().next().value ?? DEFAULT_APP_ICON;
}

export function sortAppIconIds(ids: Iterable<string>): string[] {
  const leftover = new Set(ids);
  const ordered: string[] = [];
  for (const id of APP_ICON_ORDER) {
    if (!leftover.has(id)) continue;
    leftover.delete(id);
    ordered.push(id);
  }
  return [...ordered, ...[...leftover].sort()];
}
