import Atom from "@pond/icons/fill-duo/atom";
import ClockRotateClockwise from "@pond/icons/fill-duo/clock-rotate-clockwise";
import ConnectedDots from "@pond/icons/fill-duo/connected-dots";
import Stack from "@pond/icons/fill-duo/stack";
import TaskDebug from "@pond/icons/fill-duo/task-debug";
import Arena from "@pond/icons/social-media/are-na";
import Cosmos from "@pond/icons/social-media/cosmos";
import Dribbble from "@pond/icons/social-media/dribble";
import Instagram from "@pond/icons/social-media/instagram";
import Pinterest from "@pond/icons/social-media/pinterest";
import XTwitter from "@pond/icons/social-media/x-twitter";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useMemo,
} from "react";
import { NavLink } from "react-router-dom";
import { useSaves } from "../../pool/hooks";
import { Tooltip } from "../../ui";
import styles from "./styles.module.css";

/**
 * Sidebar — port of the left rail in the Figma wireframe. Sections, in
 * order:
 *
 *   1. Logo + product name
 *   2. Search box (UI only for now; ⌘K hint mirrors Figma)
 *   3. Library / Recents / Trash
 *   4. Sources (dynamic from `save.source` distribution; each source
 *      gets its branded badge per Figma's Brand/* tokens)
 *
 * Each `<NavLink>` deeplinks into a route owned by `<App>`. The sidebar
 * itself never inspects URL state directly — `NavLink` handles the
 * "is this me" highlight via React Router.
 */
export function Sidebar() {
  const saves = useSaves();
  const sources = useMemo(() => collectSources(saves), [saves]);

  return (
    <aside className={styles.sidebar} aria-label="Library navigation">
      <Logo />
      <SearchBox />

      <Group>
        <Item to="/" end icon={Stack} label="Library" />
        <Item to="/recents" icon={ClockRotateClockwise} label="Recents" />
        <Item to="/trash" icon={TaskDebug} label="Trash" />
      </Group>

      {sources.length > 0 ? (
        <Group label="Sources">
          {sources.map((src) => (
            <SourceItem key={src} source={src} />
          ))}
          <Item to="/settings" icon={ConnectedDots} label="More" muted />
        </Group>
      ) : (
        <Group label="Sources">
          <p className={styles.empty}>No saves yet.</p>
        </Group>
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------- */
/* Building blocks.                                                     */
/* -------------------------------------------------------------------- */

function Logo() {
  return (
    <div className={styles.logo}>
      <span className={styles.logoMark} aria-hidden>
        <Atom width={12} height={12} />
      </span>
      <span className={styles.logoText}>Pond</span>
    </div>
  );
}

/**
 * Cmd/Ctrl-K search hint. Hooks up to nothing yet — the SavesView has
 * its own filter input. Keeping the chrome here matches the Figma
 * mock and lets us swap in a global command palette later without
 * touching layout.
 */
function SearchBox() {
  return (
    <Tooltip content="Open command palette" side="bottom">
      <button type="button" className={styles.search} aria-label="Search">
        <span className={styles.searchPlaceholder}>Search…</span>
        <span className={styles.searchKbd}>⌘K</span>
      </button>
    </Tooltip>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      {label ? <h2 className={styles.groupLabel}>{label}</h2> : null}
      {children}
    </section>
  );
}

interface ItemProps {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Optional adornment slot rendered in the icon well (used by sources). */
  badge?: ReactNode;
  end?: boolean;
  /** Use `true` for tertiary entries (e.g. "More"), which paint subdued. */
  muted?: boolean;
}

function Item({ to, label, icon: Icon, badge, end, muted }: ItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          styles.item,
          isActive ? styles.itemActive : "",
          muted ? styles.itemMuted : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      <span className={styles.itemIcon} aria-hidden>
        {badge ?? <Icon width={14} height={14} />}
      </span>
      <span className={styles.itemLabel}>{label}</span>
    </NavLink>
  );
}

/* -------------------------------------------------------------------- */
/* Source rendering.                                                     */
/*                                                                       */
/* Each known source (`twitter`, `cosmos`, …) gets a coloured 18×18      */
/* "badge" tile with the brand mark inside, mirroring the Figma          */
/* `Sidebar.ItemIcon` style. Unknown sources render a neutral letter     */
/* tile so newly-added scrapers don't fall off the visual grid.          */
/* -------------------------------------------------------------------- */

interface SourceMeta {
  label: string;
  /** CSS background for the 18×18 badge tile. */
  background: string;
  /** Foreground colour for the icon glyph (currentColor). */
  foreground: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Some brands (Cosmos, Are.na) need a hairline ring on light bg. */
  ring?: boolean;
}

const SOURCE_REGISTRY: Record<string, SourceMeta> = {
  twitter: {
    label: "Twitter (X)",
    background: "var(--pond-brand-twitter)",
    foreground: "#ffffff",
    Icon: XTwitter,
  },
  x: {
    label: "Twitter (X)",
    background: "var(--pond-brand-twitter)",
    foreground: "#ffffff",
    Icon: XTwitter,
  },
  cosmos: {
    label: "Cosmos",
    background: "var(--pond-brand-cosmos)",
    foreground: "#141414",
    Icon: Cosmos,
    ring: true,
  },
  reddit: {
    label: "Reddit",
    background: "var(--pond-brand-reddit)",
    foreground: "#ffffff",
    Icon: RedditMark,
  },
  arena: {
    label: "Are.na",
    background: "var(--pond-brand-arena)",
    foreground: "#141414",
    Icon: Arena,
    ring: true,
  },
  "are.na": {
    label: "Are.na",
    background: "var(--pond-brand-arena)",
    foreground: "#141414",
    Icon: Arena,
    ring: true,
  },
  facebook: {
    label: "Facebook",
    background: "var(--pond-brand-facebook)",
    foreground: "#ffffff",
    Icon: FacebookMark,
  },
  instagram: {
    label: "Instagram",
    background:
      "radial-gradient(circle at 30% 110%, #ffd600 0%, #ff6930 30%, #fe3b36 50%, transparent 80%), radial-gradient(circle at 90% 110%, #1b9df5 0%, #7017ff 40%, #ed00c0 70%, #ff1b90 100%)",
    foreground: "#ffffff",
    Icon: Instagram,
  },
  pinterest: {
    label: "Pinterest",
    background: "var(--pond-brand-pinterest)",
    foreground: "#ffffff",
    Icon: Pinterest,
  },
  dribbble: {
    label: "Dribbble",
    background: "var(--pond-brand-dribbble)",
    foreground: "#ffffff",
    Icon: Dribbble,
  },
};

function SourceItem({ source }: { source: string }) {
  const meta = SOURCE_REGISTRY[source.toLowerCase()];
  const label = meta?.label ?? toTitleCase(source);
  return (
    <NavLink
      to={`/source/${encodeURIComponent(source.toLowerCase())}`}
      className={({ isActive }) =>
        [styles.item, isActive ? styles.itemActive : ""]
          .filter(Boolean)
          .join(" ")
      }
    >
      <SourceBadge source={source} />
      <span className={styles.itemLabel}>{label}</span>
    </NavLink>
  );
}

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_REGISTRY[source.toLowerCase()];
  if (!meta) {
    return (
      <span
        className={`${styles.badge} ${styles.badgeFallback}`}
        aria-hidden
        title={source}
      >
        {source.charAt(0).toUpperCase()}
      </span>
    );
  }
  const { Icon, background, foreground, ring } = meta;
  return (
    <span
      className={`${styles.badge} ${ring ? styles.badgeRing : ""}`.trim()}
      aria-hidden
      style={{ background, color: foreground }}
    >
      <Icon width={10} height={10} />
    </span>
  );
}

/**
 * Walk the pool and emit the distinct, non-trashed `save.source` values
 * in descending count order. Sources baked into `SOURCE_REGISTRY` come
 * first in their natural order so the sidebar reads stable, then any
 * "exotic" sources we don't know about trail at the end alphabetically.
 */
function collectSources(saves: ReturnType<typeof useSaves>): string[] {
  const counts = new Map<string, number>();
  for (const s of saves) {
    if (s.deletedAt) continue;
    const key = (s.source ?? "").trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const known: string[] = [];
  const unknown: string[] = [];
  for (const k of counts.keys()) {
    if (SOURCE_REGISTRY[k]) known.push(k);
    else unknown.push(k);
  }
  // Stable order for known sources matching the Figma wireframe; the
  // tail catches anything else alphabetically so they don't reshuffle
  // every render.
  const stableOrder = [
    "twitter",
    "x",
    "cosmos",
    "reddit",
    "arena",
    "are.na",
    "facebook",
    "instagram",
    "pinterest",
    "dribbble",
  ];
  known.sort(
    (a, b) => indexOrInfinity(stableOrder, a) - indexOrInfinity(stableOrder, b),
  );
  unknown.sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}

function indexOrInfinity(list: string[], value: string): number {
  const idx = list.indexOf(value);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------------------- */
/* Inline brand marks for sources we don't have packaged icons for yet. */
/* Both kept tiny so they slot into the 10×10 badge with no resizing.   */
/* -------------------------------------------------------------------- */

function RedditMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Reddit</title>
      <path
        fill="currentColor"
        d="M28 16.06a3.36 3.36 0 0 0-5.7-2.42 16.5 16.5 0 0 0-9-2.85l1.53-7.2 5 1.06a2.4 2.4 0 1 0 .25-1.46l-5.6-1.18a.74.74 0 0 0-.88.57l-1.7 8a16.46 16.46 0 0 0-9.13 2.86 3.37 3.37 0 1 0-3.7 5.5 6.61 6.61 0 0 0-.07 1.05c0 5.34 6.21 9.66 13.87 9.66S26.74 25.55 26.74 20.21a6.6 6.6 0 0 0-.07-1.04 3.36 3.36 0 0 0 1.33-3.11ZM10.66 18.4a2.4 2.4 0 1 1 2.4 2.4 2.4 2.4 0 0 1-2.4-2.4Zm13.5 6.34A8.18 8.18 0 0 1 18.4 27a8.18 8.18 0 0 1-5.76-2.27.55.55 0 1 1 .77-.77A7.06 7.06 0 0 0 18.4 26a7.06 7.06 0 0 0 5-1.99.55.55 0 0 1 .77.77ZM21.07 20.8a2.4 2.4 0 1 1 2.4-2.4 2.4 2.4 0 0 1-2.4 2.4Z"
      />
    </svg>
  );
}

function FacebookMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Facebook</title>
      <path
        fill="currentColor"
        d="M19.6 17h3.4l.6-4.2h-4V10c0-1.2.4-2 2.2-2H24V4.2c-.4-.06-1.85-.2-3.55-.2-3.5 0-5.9 2.13-5.9 6.05v3.75H10v4.2h4.55V28h5.05V17Z"
      />
    </svg>
  );
}
