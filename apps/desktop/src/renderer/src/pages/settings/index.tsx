import ChevronLeft from "@pond/icons/fill/chevron-left";
import { type ReactNode, useMemo } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  getSourceLabel,
  SOURCE_REGISTRY,
  SourceBadge,
} from "../../components/source-badge";
import { useSaves } from "../../pool/hooks";
import { PlusIcon } from "./icons";
import {
  DEFAULT_SECTION,
  GROUP_LABELS,
  GROUP_ORDER,
  SECTIONS,
  type SectionDef,
  type SectionGroup,
  sectionsByGroup,
} from "./registry";
import { ALL_SOURCES } from "./sections/_types";
import { SourceSection } from "./sections/source";
import styles from "./styles.module.css";

/**
 * Linear-style settings takeover. Rendered without the library
 * sidebar / preview pane (see `App.tsx`'s `pond-takeover` branch).
 *
 * Layout:
 *   ┌─────────────┬───────────────────────────────────┐
 *   │ ← Back      │                                   │
 *   │             │     <Selected section>            │
 *   │ Personal    │                                   │
 *   │  Preferences│                                   │
 *   │  Profile    │                                   │
 *   │  Notifications                                  │
 *   │  …          │                                   │
 *   │             │                                   │
 *   │ Library     │                                   │
 *   │  Storage    │                                   │
 *   │  Tags       │                                   │
 *   │  …          │                                   │
 *   │             │                                   │
 *   │ Sources     │                                   │
 *   │  Twitter    │                                   │
 *   │  Instagram  │                                   │
 *   │  …          │                                   │
 *   │  + Add      │                                   │
 *   └─────────────┴───────────────────────────────────┘
 *
 * Routing is URL-based — every section has its own deep-linkable
 * route under `/settings/...`. The rail's active highlight is driven
 * by `<NavLink>`'s built-in `isActive`.
 */
export function SettingsPage() {
  return (
    <div className={styles.page}>
      <SettingsRail />
      <main className={styles.content}>
        <div className={styles.contentInner}>
          <Routes>
            <Route
              index
              element={
                <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />
              }
            />
            {SECTIONS.map((section) => (
              <Route
                key={section.id}
                path={section.path}
                element={<section.component />}
              />
            ))}
            <Route path="sources/:source" element={<SourceSection />} />
            <Route
              path="*"
              element={
                <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Sidebar                                                              */
/* -------------------------------------------------------------------- */

function SettingsRail() {
  const navigate = useNavigate();
  const sources = useSourcesForRail();

  return (
    <aside className={styles.rail} aria-label="Settings categories">
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(-1)}
      >
        <ChevronLeft width={14} height={14} />
        <span>Back to app</span>
      </button>

      {GROUP_ORDER.map((group) => (
        <NavGroupBlock key={group} group={group} />
      ))}

      <SourcesGroup sources={sources} />
    </aside>
  );
}

function NavGroupBlock({ group }: { group: SectionGroup }) {
  const items = sectionsByGroup(group);
  if (items.length === 0) return null;
  const label = GROUP_LABELS[group];
  return (
    <NavGroup label={label ?? undefined}>
      {items.map((section) => (
        <SectionRow key={section.id} section={section} />
      ))}
    </NavGroup>
  );
}

/**
 * Sources group — Linear's "Your teams" pattern. Includes every
 * known source (auth-walled + public) so users can configure them
 * even before any saves land. Sources discovered in the pool but not
 * in the registry tail at the end alphabetically.
 */
function SourcesGroup({ sources }: { sources: string[] }) {
  if (sources.length === 0) {
    return (
      <NavGroup label="Sources">
        <p className={styles.railEmpty}>No sources yet.</p>
      </NavGroup>
    );
  }
  return (
    <NavGroup label="Sources">
      {sources.map((src) => (
        <SourceRow key={src} source={src} />
      ))}
      <button
        type="button"
        className={`${styles.navItem} ${styles.navItemMuted}`}
        onClick={() => {
          // Adding a source today means signing into a known one.
          // The connected-accounts overview is the closest thing.
          window.location.hash = "#/settings/connected-accounts";
        }}
      >
        <span className={styles.navIcon} aria-hidden>
          <PlusIcon />
        </span>
        <span>Add source</span>
      </button>
    </NavGroup>
  );
}

function NavGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.navGroup}>
      {label ? <h2 className={styles.navGroupLabel}>{label}</h2> : null}
      <ul className={styles.navList}>{children}</ul>
    </section>
  );
}

function SectionRow({ section }: { section: SectionDef }) {
  return (
    <li>
      <NavLink
        to={`/settings/${section.path}`}
        className={({ isActive }) =>
          [styles.navItem, isActive ? styles.navItemActive : ""]
            .filter(Boolean)
            .join(" ")
        }
      >
        <span className={styles.navIcon} aria-hidden>
          <section.icon width={14} height={14} />
        </span>
        <span className={styles.navItemLabel}>{section.label}</span>
      </NavLink>
    </li>
  );
}

function SourceRow({ source }: { source: string }) {
  return (
    <li>
      <NavLink
        to={`/settings/sources/${source}`}
        className={({ isActive }) =>
          [styles.navItem, isActive ? styles.navItemActive : ""]
            .filter(Boolean)
            .join(" ")
        }
      >
        <span className={styles.navIcon} aria-hidden>
          <SourceBadge source={source} size={16} glyphSize={9} />
        </span>
        <span className={styles.navItemLabel}>{getSourceLabel(source)}</span>
      </NavLink>
    </li>
  );
}

/**
 * Compose the sources rail from:
 *
 *   1. Every source in `ALL_SOURCES` (so users can configure each one
 *      even before they have a save from it),
 *   2. Plus any "exotic" sources discovered in the save pool that
 *      aren't in the registry — appended alphabetically.
 *
 * Stable order matches the brand sequence used elsewhere so the rail
 * never shuffles between renders.
 */
function useSourcesForRail(): string[] {
  const saves = useSaves();
  return useMemo(() => {
    const known: string[] = [];
    for (const { id } of ALL_SOURCES) {
      // Dedupe twitter/x and arena/are.na — pick the canonical id.
      if (!known.includes(id)) known.push(id);
    }

    const extras = new Set<string>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      const key = (s.source ?? "").trim().toLowerCase();
      if (!key) continue;
      const isKnown = SOURCE_REGISTRY[key];
      const inSidebar =
        known.includes(key) ||
        (key === "x" && known.includes("twitter")) ||
        (key === "are.na" && known.includes("arena"));
      if (!isKnown && !inSidebar) extras.add(key);
    }

    return [...known, ...[...extras].sort((a, b) => a.localeCompare(b))];
  }, [saves]);
}
