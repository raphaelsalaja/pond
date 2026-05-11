import {
  IconCalendarOutline18,
  IconChevronRightOutline18,
  IconColorPaletteOutline18,
  IconFileOutline18,
  IconLinkOutline18,
  IconPencilOutline18,
  IconRulerOutline18,
  IconScaleOutline18,
  IconShapesOutline18,
  IconStopwatchOutline18,
  IconTagOutline18,
  IconUploadOutline18,
  IconUserOutline18,
} from "@pond/icons/outline";
import type { SaveLike } from "@pond/schema/filters/match";
import { matches } from "@pond/schema/filters/match";
import { FIELD_IDS, FIELD_META } from "@pond/schema/filters/meta";
import type {
  ComparatorId,
  FieldId,
  Predicate,
  Query,
} from "@pond/schema/filters/types";
import { Input, Menu } from "@pond/ui";
import {
  type ComponentType,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSaves } from "@/pool/hooks";
import { DATE_PRESETS } from "./date-presets";
import { ColorDropdown } from "./dropdowns/color";
import { DateDropdown } from "./dropdowns/date";
import { EnumDropdown } from "./dropdowns/enum";
import { NumberDropdown } from "./dropdowns/number";
import { OptionalDropdown } from "./dropdowns/optional";
import { StringDropdown } from "./dropdowns/string";
import { TagsDropdown } from "./dropdowns/tags";
import type { DropdownProps } from "./dropdowns/types";
import { defaultPredicateFor, predicateIsActive } from "./helpers";
import { pushRecent, useRecents } from "./recents";
import { parseRelative } from "./relative-time";
import { predicateKey, searchEntries } from "./score";
import styles from "./styles.module.css";

type IconType = ComponentType<{
  width?: string | number;
  height?: string | number;
}>;

export const FIELD_ICONS: Record<FieldId, IconType> = {
  tags: IconTagOutline18,
  source: IconLinkOutline18,
  type: IconFileOutline18,
  shape: IconShapesOutline18,
  size: IconScaleOutline18,
  duration: IconStopwatchOutline18,
  dimensions: IconRulerOutline18,
  color: IconColorPaletteOutline18,
  creator: IconUserOutline18,
  url: IconLinkOutline18,
  note: IconPencilOutline18,
  savedAt: IconUploadOutline18,
  publishedAt: IconCalendarOutline18,
  modifiedAt: IconCalendarOutline18,
};

/**
 * `display: "submenu"` collapses the group into a single parent
 * row that opens its fields as a nested submenu (Linear-style —
 * see the "Dates" entry in their issue filter menu). Without it,
 * the group's fields render flat in the top-level popup with a
 * separator above. Pond uses the submenu form for date fields
 * because they share a UI shape and benefit from being bundled.
 */
interface FieldGroup {
  id: FieldGroupId;
  label: string;
  display?: "submenu";
  icon?: IconType;
}

export type FieldGroupId = "content" | "media" | "people" | "time";

export const FIELD_GROUPS: readonly FieldGroup[] = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "people", label: "People" },
  {
    id: "time",
    label: "Dates",
    display: "submenu",
    icon: IconCalendarOutline18,
  },
];

/** Group field ids by their `FieldMeta.group`. Mirrors the legacy
 * `filtersByGroup()` shape so `<FilterSubmenu>` can stay simple. */
export function fieldsByGroup(): Record<FieldGroupId, FieldId[]> {
  const out: Record<FieldGroupId, FieldId[]> = {
    content: [],
    media: [],
    people: [],
    time: [],
  };
  for (const id of FIELD_IDS) {
    out[FIELD_META[id].group].push(id);
  }
  return out;
}

/** Friendly label for each comparator, sized for the chip's
 * "operator" segment. The chip flips between these depending on
 * the field type's allowed comparators. */
export const COMPARATOR_LABELS: Record<ComparatorId, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  nin: "is none of",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  lt: "is less than",
  lte: "is at most",
  gt: "is greater than",
  gte: "is at least",
  between: "is between",
  some: "include any",
  every: "include all",
  none: "exclude all",
  near: "is close to",
  exists: "is set",
};

const DATE_FIELDS: FieldId[] = ["savedAt", "publishedAt", "modifiedAt"];

/**
 * Pick the dropdown component for a given field. We dispatch on the
 * field's *type* rather than its id so adding a new field that's
 * already covered by an existing type (string, number, enum, …)
 * doesn't require a new component.
 *
 * The note field is the only `optional` for now and gets its own
 * dropdown so the toggle reads as "with note / without note"
 * instead of the generic "is set" copy.
 */
export function dropdownFor(field: FieldId): ComponentType<DropdownProps> {
  const meta = FIELD_META[field];
  switch (meta.type) {
    case "stringArray":
      return TagsDropdown;
    case "enum":
      return EnumDropdown;
    case "number":
      return NumberDropdown;
    case "date":
      return DateDropdown;
    case "color":
      return ColorDropdown;
    case "optional":
      return OptionalDropdown;
    default:
      return StringDropdown;
  }
}

interface FilterSubmenuProps {
  field: FieldId;
  onCommit: (predicate: Predicate) => void;
  /** Optional muted prefix rendered before the field label.
   * Used by flat search results so a "Saved" submenu reads as
   * "Dates › Saved" without lying about the parent menu. */
  breadcrumb?: string;
}

/**
 * One row in the "Add filter" menu. Hovering / clicking opens a
 * nested submenu hosting the field's value picker — Linear-style:
 * the user picks a value once, the predicate commits, and the
 * whole menu chain closes.
 *
 * We hold a local `draft` predicate while the submenu is open so
 * the picker has somewhere to write before the user has finished.
 * Two flush points:
 *
 *   1. Single-click presets (`Menu.Item` with default
 *      `closeOnClick`) close the chain → `onOpenChange(false)`
 *      fires → we commit the latest draft.
 *   2. Multi-select pickers (Tags, Enum) keep the submenu open
 *      while the user toggles. They commit on close-by-outside /
 *      Escape via the same path.
 *
 * The draft is read through a ref inside the close handler so
 * setState batching from a preset click can't lose its update.
 *
 * `dirtyRef` tracks whether the user actually touched the picker
 * during this open. Without it, fields whose default predicate is
 * already "active" — `note` defaults to `{cmp:"exists", value:true}`,
 * which `predicateIsActive` reports as active — would auto-commit
 * on a mere hover-leave, dropping a chip the user never asked for.
 * Reset on every open so each visit starts clean.
 */
export function FilterSubmenu({
  field,
  onCommit,
  breadcrumb,
}: FilterSubmenuProps) {
  const meta = FIELD_META[field];
  const Icon = FIELD_ICONS[field];
  const Dropdown = dropdownFor(field);
  const [draft, setDraft] = useState<Predicate>(() =>
    defaultPredicateFor(field),
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(false);

  function handleChange(next: Predicate) {
    dirtyRef.current = true;
    setDraft(next);
  }

  return (
    <Menu.SubmenuRoot
      onOpenChange={(open) => {
        if (open) {
          dirtyRef.current = false;
          return;
        }
        const d = draftRef.current;
        if (dirtyRef.current && predicateIsActive(d)) onCommit(d);
        setDraft(defaultPredicateFor(field));
        dirtyRef.current = false;
      }}
    >
      <Menu.SubmenuTrigger>
        <Menu.ItemIcon>
          <Icon width="1em" height="1em" />
        </Menu.ItemIcon>
        <Menu.ItemLabel>
          {breadcrumb ? (
            <span className={styles.breadcrumb}>{breadcrumb}&nbsp;›&nbsp;</span>
          ) : null}
          {meta.label}
        </Menu.ItemLabel>
        <span className={styles["submenu-chevron"]} aria-hidden>
          <IconChevronRightOutline18 width="0.85em" height="0.85em" />
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner align="start" side="left" sideOffset={6}>
          <Menu.Popup className={styles["value-popup"]}>
            <Dropdown predicate={draft} onChange={handleChange} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

interface GroupSubmenuProps {
  group: FieldGroup;
  fields: readonly FieldId[];
  onCommit: (predicate: Predicate) => void;
  breadcrumb?: string;
}

/**
 * Renders a `FieldGroup` (with `display: "submenu"`) as a single
 * row in the parent menu that, on hover, opens its child fields
 * in a nested popup. Stacks on top of `FilterSubmenu` so the
 * date field rows still get their own value-picker submenus —
 * three levels deep total: Add filter → Dates → Saved → picker.
 */
export function GroupSubmenu({
  group,
  fields,
  onCommit,
  breadcrumb,
}: GroupSubmenuProps) {
  const Icon = group.icon;
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger>
        {Icon ? (
          <Menu.ItemIcon>
            <Icon width="1em" height="1em" />
          </Menu.ItemIcon>
        ) : null}
        <Menu.ItemLabel>
          {breadcrumb ? (
            <span className={styles.breadcrumb}>{breadcrumb}&nbsp;›&nbsp;</span>
          ) : null}
          {group.label}
        </Menu.ItemLabel>
        <span className={styles["submenu-chevron"]} aria-hidden>
          <IconChevronRightOutline18 width="0.85em" height="0.85em" />
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner align="start" side="left" sideOffset={6}>
          <Menu.Popup>
            {fields.map((field) => (
              <FilterSubmenu key={field} field={field} onCommit={onCommit} />
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

/**
 * One row in the global Add filter search. Empty-query mode
 * renders the existing tree directly; non-empty mode flattens
 * the index into a ranked, fuzzy-matched list.
 *
 * `value` rows commit a fully-formed predicate on click. The
 * other three kinds open a submenu via `FilterSubmenu` /
 * `GroupSubmenu` so the user can keep drilling.
 */
export type SearchEntry =
  | {
      kind: "field";
      field: FieldId;
      label: string;
      breadcrumb: string;
    }
  | {
      kind: "group";
      group: FieldGroup;
      label: string;
      breadcrumb: string;
    }
  | {
      kind: "field-in-group";
      field: FieldId;
      group: FieldGroup;
      label: string;
      breadcrumb: string;
    }
  | {
      kind: "value";
      predicate: Predicate;
      label: string;
      breadcrumb: string;
      swatchHex?: string;
    };

const TAG_CAP = 50;
const CREATOR_CAP = 50;
const HOST_CAP = 50;
const COLOR_CAP = 36;

/**
 * Build the full searchable index. Static entries (fields,
 * groups, presets) are constant; user-derived sets (tags,
 * creators, URL hostnames, dominant colors) are ranked by
 * frequency and capped so a noisy library can't blow up the
 * index.
 *
 * Each `value` entry's predicate matches exactly what the
 * corresponding dropdown writes when the user picks that value
 * by hand — single source of truth.
 */
export function buildSearchIndex(saves: readonly SaveLike[]): SearchEntry[] {
  const groups = fieldsByGroup();
  const submenuGroupIds = new Set(
    FIELD_GROUPS.filter((g) => g.display === "submenu").map((g) => g.id),
  );
  const out: SearchEntry[] = [];

  /* groups + fields */
  for (const group of FIELD_GROUPS) {
    if (group.display === "submenu") {
      out.push({
        kind: "group",
        group,
        label: group.label,
        breadcrumb: "",
      });
      for (const field of groups[group.id]) {
        out.push({
          kind: "field-in-group",
          field,
          group,
          label: FIELD_META[field].label,
          breadcrumb: group.label,
        });
      }
    } else {
      for (const field of groups[group.id]) {
        out.push({
          kind: "field",
          field,
          label: FIELD_META[field].label,
          breadcrumb: "",
        });
      }
    }
  }

  /* preset value entries */
  for (const id of FIELD_IDS) {
    const meta = FIELD_META[id];
    if (!meta.presets) continue;

    if (meta.type === "enum") {
      for (const preset of meta.presets) {
        out.push({
          kind: "value",
          predicate: { kind: "p", field: id, cmp: "eq", value: preset.value },
          label: preset.label,
          breadcrumb: meta.label,
        });
      }
    } else if (meta.type === "number") {
      for (const preset of meta.presets) {
        const value =
          typeof preset.value === "number"
            ? preset.value
            : Number(preset.value);
        if (!Number.isFinite(value)) continue;
        out.push({
          kind: "value",
          predicate: { kind: "p", field: id, cmp: "lte", value },
          label: preset.label,
          breadcrumb: meta.label,
        });
      }
    }
  }

  /* date presets × date fields */
  for (const field of DATE_FIELDS) {
    const meta = FIELD_META[field];
    const breadcrumb = submenuGroupIds.has(meta.group)
      ? `Dates › ${meta.label}`
      : meta.label;
    for (const preset of DATE_PRESETS) {
      out.push({
        kind: "value",
        predicate: { kind: "p", field, cmp: "gte", value: preset.iso },
        label: preset.label,
        breadcrumb,
      });
    }
  }

  /* optional (note) — with / without */
  out.push({
    kind: "value",
    predicate: { kind: "p", field: "note", cmp: "exists", value: true },
    label: "With note",
    breadcrumb: FIELD_META.note.label,
  });
  out.push({
    kind: "value",
    predicate: { kind: "p", field: "note", cmp: "exists", value: false },
    label: "Without note",
    breadcrumb: FIELD_META.note.label,
  });

  /* user-derived sets */
  appendTagEntries(out, saves);
  appendCreatorEntries(out, saves);
  appendHostEntries(out, saves);
  appendColorEntries(out, saves);

  return out;
}

function appendTagEntries(
  out: SearchEntry[],
  saves: readonly SaveLike[],
): void {
  const counts = new Map<string, number>();
  for (const save of saves) {
    if ((save as { deletedAt?: unknown }).deletedAt) continue;
    const merged = [...(save.tags ?? []), ...(save.aiTags ?? [])];
    for (const tag of merged) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TAG_CAP);
  for (const [tag] of top) {
    out.push({
      kind: "value",
      predicate: { kind: "p", field: "tags", cmp: "some", value: [tag] },
      label: tag,
      breadcrumb: FIELD_META.tags.label,
    });
  }
}

function appendCreatorEntries(
  out: SearchEntry[],
  saves: readonly SaveLike[],
): void {
  const counts = new Map<string, number>();
  for (const save of saves) {
    if ((save as { deletedAt?: unknown }).deletedAt) continue;
    const author = (save.author ?? "").trim();
    if (!author) continue;
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CREATOR_CAP);
  for (const [author] of top) {
    out.push({
      kind: "value",
      predicate: { kind: "p", field: "creator", cmp: "eq", value: author },
      label: author,
      breadcrumb: FIELD_META.creator.label,
    });
  }
}

function appendHostEntries(
  out: SearchEntry[],
  saves: readonly SaveLike[],
): void {
  const counts = new Map<string, number>();
  for (const save of saves) {
    if ((save as { deletedAt?: unknown }).deletedAt) continue;
    const host = parseHost(save.url);
    if (!host) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, HOST_CAP);
  for (const [host] of top) {
    out.push({
      kind: "value",
      predicate: { kind: "p", field: "url", cmp: "contains", value: host },
      label: host,
      breadcrumb: FIELD_META.url.label,
    });
  }
}

function appendColorEntries(
  out: SearchEntry[],
  saves: readonly SaveLike[],
): void {
  const counts = new Map<string, number>();
  for (const save of saves) {
    if ((save as { deletedAt?: unknown }).deletedAt) continue;
    const list = save.dominantColors ?? [];
    for (const c of list) {
      const hex = (c.hex ?? "").replace(/^#/, "").toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) continue;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COLOR_CAP);
  for (const [hex] of top) {
    out.push({
      kind: "value",
      predicate: { kind: "p", field: "color", cmp: "near", value: { hex } },
      label: `#${hex}`,
      breadcrumb: FIELD_META.color.label,
      swatchHex: hex,
    });
  }
}

function parseHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Compute "how many saves match this predicate" for every visible
 * `value` entry. Memoised by the saves snapshot reference and the
 * canonical predicate key, so re-typing a query that surfaces the
 * same predicates skips the per-save walk entirely.
 *
 * Counts are skipped for `field` / `group` / `field-in-group`
 * entries — the row opens a picker and the count would be the
 * total number of saves where the field is set, which isn't a
 * useful preview to dangle on hover.
 */
function useEntryCounts(
  saves: readonly SaveLike[],
  entries: SearchEntry[] | null,
): Map<string, number> {
  const cacheRef = useRef<{
    saves: readonly SaveLike[] | null;
    map: Map<string, number>;
  }>({ saves: null, map: new Map() });

  return useMemo(() => {
    if (!entries) return new Map();
    if (cacheRef.current.saves !== saves) {
      cacheRef.current = { saves, map: new Map() };
    }
    const cache = cacheRef.current.map;
    const out = new Map<string, number>();
    for (const entry of entries) {
      if (entry.kind !== "value") continue;
      const key = predicateKey(entry.predicate);
      if (out.has(key)) continue;
      let count = cache.get(key);
      if (count == null) {
        count = 0;
        const query: Query = { kind: "and", clauses: [entry.predicate] };
        for (const save of saves) {
          if ((save as { deletedAt?: unknown }).deletedAt) continue;
          if (matches(query, save)) count++;
        }
        cache.set(key, count);
      }
      out.set(key, count);
    }
    return out;
  }, [saves, entries]);
}

const RESULT_CAP = 50;

interface AddFilterMenuProps {
  /** Called when the user picks a filter value. The caller
   * appends it to the current `Query`. */
  onCommit: (predicate: Predicate) => void;
  /** Forwarded to the search input so the F hotkey can grab focus
   * after the menu opens. The header toolbar passes this; the
   * inline chip-bar AddTrigger doesn't bother. */
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * The popup contents shared by every "Add filter" surface. Owns
 * the search input, the index, the scoring/dedup pipeline, the
 * count cache, and the recents bridge.
 *
 * Render switch:
 *   - empty query → grouped tree (FIELD_GROUPS / FilterSubmenu /
 *     GroupSubmenu unchanged)
 *   - non-empty query → flat ranked list of `SearchEntry` rows
 */
export function AddFilterMenu({ onCommit, inputRef }: AddFilterMenuProps) {
  const saves = useSaves();
  const [q, setQ] = useState("");
  const recentList = useRecents();
  const recents = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < recentList.length; i++) {
      const key = recentList[i];
      if (key !== undefined) map.set(key, i);
    }
    return map;
  }, [recentList]);

  const groups = useMemo(() => fieldsByGroup(), []);
  const index = useMemo(() => buildSearchIndex(saves), [saves]);

  const synthetic = useMemo<SearchEntry[]>(() => {
    const m = parseRelative(q);
    if (!m) return [];
    return DATE_FIELDS.map((field) => {
      const meta = FIELD_META[field];
      return {
        kind: "value",
        predicate: { kind: "p", field, cmp: "gte", value: m.isoDuration },
        label: m.label,
        breadcrumb: `Dates › ${meta.label}`,
      } as const;
    });
  }, [q]);

  const results = useMemo<SearchEntry[] | null>(() => {
    if (!q.trim()) return null;
    const seen = new Set<string>();
    const merged: SearchEntry[] = [];
    for (const list of [index, synthetic]) {
      for (const entry of list) {
        if (entry.kind === "value") {
          const k = predicateKey(entry.predicate);
          if (seen.has(k)) continue;
          seen.add(k);
        }
        merged.push(entry);
      }
    }
    return searchEntries(merged, q, recents).slice(0, RESULT_CAP);
  }, [q, index, synthetic, recents]);

  const counts = useEntryCounts(saves, results);

  const commit = useCallback(
    (predicate: Predicate) => {
      onCommit(predicate);
      pushRecent(predicateKey(predicate));
    },
    [onCommit],
  );

  return (
    <>
      <div className={styles["search-row"]}>
        <Input.Root
          ref={inputRef}
          type="search"
          value={q}
          placeholder="Add filter…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Base UI Menu has popup-level typeahead that pulls focus
            // onto the item matching the typed letter. Shield text
            // keys so the search input owns them; leave Escape/Tab/
            // arrows/Enter to bubble for menu nav + dismissal.
            const k = e.key;
            if (k.length === 1 || k === "Backspace" || k === "Delete") {
              e.stopPropagation();
            }
          }}
          autoFocus
          spellCheck={false}
          aria-label="Add filter"
        />
        <kbd className={styles.kbd} aria-hidden>
          F
        </kbd>
      </div>
      {results === null ? (
        FIELD_GROUPS.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 ? <Menu.Separator /> : null}
            {group.display === "submenu" ? (
              <GroupSubmenu
                group={group}
                fields={groups[group.id]}
                onCommit={commit}
              />
            ) : (
              groups[group.id].map((field) => (
                <FilterSubmenu key={field} field={field} onCommit={commit} />
              ))
            )}
          </Fragment>
        ))
      ) : results.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : (
        results.map((entry) => (
          <ResultRow
            key={entryKey(entry)}
            entry={entry}
            count={
              entry.kind === "value"
                ? counts.get(predicateKey(entry.predicate))
                : undefined
            }
            groupFields={
              entry.kind === "group" ? groups[entry.group.id] : undefined
            }
            onCommit={commit}
          />
        ))
      )}
    </>
  );
}

interface ResultRowProps {
  entry: SearchEntry;
  count: number | undefined;
  groupFields: FieldId[] | undefined;
  onCommit: (predicate: Predicate) => void;
}

function ResultRow({ entry, count, groupFields, onCommit }: ResultRowProps) {
  switch (entry.kind) {
    case "group":
      return (
        <GroupSubmenu
          group={entry.group}
          fields={groupFields ?? []}
          onCommit={onCommit}
          breadcrumb={entry.breadcrumb || undefined}
        />
      );
    case "field":
      return (
        <FilterSubmenu
          field={entry.field}
          onCommit={onCommit}
          breadcrumb={entry.breadcrumb || undefined}
        />
      );
    case "field-in-group":
      return (
        <FilterSubmenu
          field={entry.field}
          onCommit={onCommit}
          breadcrumb={entry.breadcrumb || undefined}
        />
      );
    case "value": {
      const Icon = FIELD_ICONS[entry.predicate.field];
      return (
        <Menu.Item onClick={() => onCommit(entry.predicate)}>
          {entry.swatchHex ? (
            <span
              className={styles["swatch-dot"]}
              style={{ background: `#${entry.swatchHex}` }}
              aria-hidden
            />
          ) : (
            <Menu.ItemIcon>
              <Icon width="1em" height="1em" />
            </Menu.ItemIcon>
          )}
          <Menu.ItemLabel>
            {entry.breadcrumb ? (
              <span className={styles.breadcrumb}>
                {entry.breadcrumb}&nbsp;›&nbsp;
              </span>
            ) : null}
            {entry.label}
          </Menu.ItemLabel>
          {count != null ? (
            <span className={styles.count}>{formatCount(count)}</span>
          ) : null}
        </Menu.Item>
      );
    }
  }
}

function entryKey(entry: SearchEntry): string {
  switch (entry.kind) {
    case "group":
      return `group:${entry.group.id}`;
    case "field":
      return `field:${entry.field}`;
    case "field-in-group":
      return `field-in-group:${entry.group.id}:${entry.field}`;
    case "value":
      return `value:${predicateKey(entry.predicate)}`;
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Listens for `F` on the document and calls `onActivate()` when
 * the user isn't typing into another input. Mirrors Linear's
 * `F` shortcut for opening the filter menu. The cb is read
 * through a ref so the listener doesn't churn when callers pass
 * a fresh closure each render.
 */
export function useFilterHotkey(onActivate: () => void): void {
  const cb = useRef(onActivate);
  cb.current = onActivate;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "f") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      cb.current();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
