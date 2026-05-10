import {
  IconArrowDownOutline18,
  IconArrowUpOutline18,
} from "@pond/icons/outline";
import { Popover, Select, Switch, Tooltip } from "@pond/ui";
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type DisplayPrefKey,
  setDisplayPref,
  useDisplayPrefs,
} from "@/lib/display-prefs";
import { readViewPref, writeViewPref } from "@/lib/view-prefs";
import styles from "./styles.module.css";

/**
 * Library view options popover. The single source of truth for which
 * layout, sort key, and display chrome the saves grid is showing.
 *
 * Layout / Sort write to URL search params (`?view`, `?sort`, `?dir`)
 * so a deep link to /source/twitter?view=grid&sort=title still
 * preserves the user's pick. Display switches write to localStorage
 * via `useDisplayPrefs()` because they're per-machine ergonomic
 * choices, not part of a shareable URL.
 */

type LayoutValue = "waterfall" | "grid" | "justified" | "list";
type SortKey = "savedAt" | "title" | "fileSize";
type SortDir = "asc" | "desc";

const LAYOUT_OPTIONS: Array<{ value: LayoutValue; label: string }> = [
  { value: "waterfall", label: "Waterfall" },
  { value: "grid", label: "Grid" },
  { value: "justified", label: "Justified" },
  { value: "list", label: "List" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "savedAt", label: "Date saved" },
  { value: "title", label: "Title" },
  { value: "fileSize", label: "Size" },
];

const DISPLAY_TOGGLES: Array<{ key: DisplayPrefKey; label: string }> = [
  { key: "name", label: "Show name" },
  { key: "date", label: "Show date" },
  { key: "fileCount", label: "Show file count" },
  { key: "sourceBadge", label: "Show source badge" },
];

const LAYOUT_VALUES = new Set<LayoutValue>([
  "waterfall",
  "grid",
  "justified",
  "list",
]);

const SORT_VALUES = new Set<SortKey>(["savedAt", "title", "fileSize"]);

interface RootProps {
  trigger: React.ReactElement;
}

function Root({ trigger }: RootProps) {
  const [params, setParams] = useSearchParams();

  const rawView = params.get("view") ?? readViewPref("view") ?? "waterfall";
  const layout: LayoutValue = LAYOUT_VALUES.has(rawView as LayoutValue)
    ? (rawView as LayoutValue)
    : "waterfall";

  const rawSort = params.get("sort") ?? readViewPref("sort") ?? "savedAt";
  const sortKey: SortKey = SORT_VALUES.has(rawSort as SortKey)
    ? (rawSort as SortKey)
    : "savedAt";
  const rawDir = params.get("dir") ?? readViewPref("dir");
  const sortDir: SortDir = rawDir === "asc" ? "asc" : "desc";

  const prefs = useDisplayPrefs();

  const setLayout = useCallback(
    (next: LayoutValue) => {
      const p = new URLSearchParams(params);
      if (next === "waterfall") p.delete("view");
      else p.set("view", next);
      setParams(p, { replace: true });
      writeViewPref("view", next);
    },
    [params, setParams],
  );

  const setSortKey = useCallback(
    (next: SortKey) => {
      const p = new URLSearchParams(params);
      if (next === "savedAt") p.delete("sort");
      else p.set("sort", next);
      setParams(p, { replace: true });
      writeViewPref("sort", next);
    },
    [params, setParams],
  );

  const setSortDir = useCallback(
    (next: SortDir) => {
      const p = new URLSearchParams(params);
      if (next === "desc") p.delete("dir");
      else p.set("dir", next);
      setParams(p, { replace: true });
      writeViewPref("dir", next);
    },
    [params, setParams],
  );

  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={6}
        className={styles.popup}
      >
        <Row label="Layout">
          <Select.Root
            value={layout}
            onValueChange={(v) => {
              if (
                typeof v === "string" &&
                LAYOUT_VALUES.has(v as LayoutValue)
              ) {
                setLayout(v as LayoutValue);
              }
            }}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {LAYOUT_OPTIONS.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Row>

        <Popover.Separator />

        <Row label="Sort by">
          <span className={styles["sort-controls"]}>
            <Select.Root
              value={sortKey}
              onValueChange={(v) => {
                if (typeof v === "string" && SORT_VALUES.has(v as SortKey)) {
                  setSortKey(v as SortKey);
                }
              }}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {SORT_OPTIONS.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <fieldset className={styles["dir-group"]}>
              <legend className={styles["sr-only"]}>Sort direction</legend>
              <Tooltip.Root content="Ascending" side="bottom">
                <button
                  type="button"
                  aria-label="Sort ascending"
                  aria-pressed={sortDir === "asc"}
                  className={styles["dir-btn"]}
                  onClick={() => setSortDir("asc")}
                >
                  <IconArrowUpOutline18 width="0.85em" height="0.85em" />
                </button>
              </Tooltip.Root>
              <Tooltip.Root content="Descending" side="bottom">
                <button
                  type="button"
                  aria-label="Sort descending"
                  aria-pressed={sortDir === "desc"}
                  className={styles["dir-btn"]}
                  onClick={() => setSortDir("desc")}
                >
                  <IconArrowDownOutline18 width="0.85em" height="0.85em" />
                </button>
              </Tooltip.Root>
            </fieldset>
          </span>
        </Row>

        <Popover.Separator />

        {DISPLAY_TOGGLES.map(({ key, label }) => (
          <Row key={key} label={label}>
            <Switch.Root
              checked={prefs[key]}
              onCheckedChange={(v) => setDisplayPref(key, Boolean(v))}
            />
          </Row>
        ))}
      </Popover.Content>
    </Popover.Root>
  );
}

interface RowProps {
  label: string;
  children: React.ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <div className={styles.row}>
      <span className={styles["row-label"]}>{label}</span>
      <span className={styles["row-control"]}>{children}</span>
    </div>
  );
}

export const LayoutPopover = {
  Root,
};
