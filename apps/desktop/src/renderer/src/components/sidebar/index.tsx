import Atom from "@pond/icons/fill-duo/atom";
import Stack from "@pond/icons/fill-duo/stack";
import Trash from "@pond/icons/fill-duo/trash";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useMemo,
} from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useSaves } from "../../pool/hooks";
import { HelpPopover } from "../help-popover";
import { getSourceLabel, SOURCE_REGISTRY, SourceBadge } from "../source-badge";
import styles from "./styles.module.css";

/**
 * Sidebar — port of the left rail in the Figma wireframe. Sections, in
 * order:
 *
 *   1. Logo + product name
 *   2. Library / Trash
 *   3. Sources (dynamic from `save.source` distribution; each source
 *      gets its branded badge per Figma's Brand/* tokens)
 *   4. Floating "?" help launcher pinned to the bottom-left
 *
 * Each `<NavLink>` deeplinks into a route owned by `<App>`. The sidebar
 * itself never inspects URL state directly — `NavLink` handles the
 * "is this me" highlight via React Router.
 */
export function Sidebar() {
  const saves = useSaves();
  const sources = useMemo(() => collectSources(saves), [saves]);
  const tagGroups = useMemo(() => collectTagGroups(saves), [saves]);
  const inboxCount = useMemo(() => countInbox(saves), [saves]);

  return (
    <aside className={styles.sidebar} aria-label="Library navigation">
      <div className={styles.scroll}>
        <Logo />

        <Group>
          <Item to="/" end icon={Stack} label="Library" />
          <Item
            to="/inbox"
            icon={Stack}
            label={inboxCount > 0 ? `Inbox (${inboxCount})` : "Inbox"}
          />
          <Item to="/activity" icon={Atom} label="Activity" />
          <Item to="/trash" icon={Trash} label="Trash" />
        </Group>

        {sources.length > 0 ? (
          <Group label="Sources">
            {sources.map((src) => (
              <SourceItem key={src} source={src} />
            ))}
          </Group>
        ) : (
          <Group label="Sources">
            <p className={styles.empty}>No saves yet.</p>
          </Group>
        )}

        {tagGroups.length > 0 ? (
          <Group label="Tags">
            {tagGroups.map((g) => (
              <TagGroup key={g.label} label={g.label} tags={g.tags} />
            ))}
          </Group>
        ) : null}
      </div>

      <div className={styles.footer}>
        <HelpPopover />
      </div>
    </aside>
  );
}

function TagGroup({
  label,
  tags,
}: {
  label: string;
  tags: Array<{ name: string; count: number; color: string | null }>;
}) {
  if (tags.length === 0) return null;
  if (label === "_") {
    return (
      <>
        {tags.map((t) => (
          <TagItem key={t.name} tag={t} />
        ))}
      </>
    );
  }
  return (
    <div>
      <h3 className={styles.subgroupLabel}>{label}</h3>
      {tags.map((t) => (
        <TagItem key={t.name} tag={t} />
      ))}
    </div>
  );
}

function TagItem({
  tag,
}: {
  tag: { name: string; count: number; color: string | null };
}) {
  const [params] = useSearchParams();
  const active = (params.get("tag") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(tag.name.toLowerCase());
  const swatch = tag.color ?? "var(--pond-tag-default, #5a87f3)";
  return (
    <NavLink
      to={`/?tag=${encodeURIComponent(tag.name)}`}
      className={[styles.item, active ? styles.itemActive : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: swatch,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span className={styles.itemLabel}>{tag.name}</span>
      <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 11 }}>
        {tag.count}
      </span>
    </NavLink>
  );
}

interface TagBucket {
  label: string;
  tags: Array<{ name: string; count: number; color: string | null }>;
}

/**
 * Walk the pool, collect tag occurrences, group by `tag.group` (read
 * from the canonical row when available, falls back to `_` ungrouped).
 * Sorted by descending count within each group, top 12 in the
 * ungrouped tail to keep the rail compact.
 */
function collectTagGroups(saves: ReturnType<typeof useSaves>): TagBucket[] {
  const counts = new Map<string, number>();
  for (const s of saves) {
    if (s.deletedAt) continue;
    for (const t of s.tags) {
      const key = t.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  const buckets = new Map<string, TagBucket>();
  for (const [name, count] of counts) {
    const bucket = buckets.get("_") ?? { label: "_", tags: [] };
    bucket.tags.push({ name, count, color: null });
    buckets.set("_", bucket);
  }
  const flat = Array.from(buckets.values());
  for (const b of flat) {
    b.tags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    b.tags = b.tags.slice(0, 24);
  }
  return flat;
}

/** Count saves with at least one un-applied AI suggestion. */
function countInbox(saves: ReturnType<typeof useSaves>): number {
  let count = 0;
  for (const s of saves) {
    if (s.deletedAt) continue;
    const sug = (
      s as unknown as {
        aiSuggestions?: Record<
          string,
          { appliedAt: string | null } | undefined
        > | null;
      }
    ).aiSuggestions;
    if (!sug) continue;
    if (
      Object.values(sug).some(
        (v) => v && (v as { appliedAt: string | null }).appliedAt === null,
      )
    ) {
      count += 1;
    }
  }
  return count;
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

function SourceItem({ source }: { source: string }) {
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
      <span className={styles.itemLabel}>{getSourceLabel(source)}</span>
    </NavLink>
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
    "tiktok",
    "youtube",
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
