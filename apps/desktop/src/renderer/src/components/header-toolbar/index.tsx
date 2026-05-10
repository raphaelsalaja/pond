import {
  IconBarsFilterOutline18,
  IconGridOutline18,
  IconMagnifierOutline18,
  IconMinusOutline18,
  IconPlusOutline18,
} from "@pond/icons/outline";
import { EMPTY_QUERY, type Predicate } from "@pond/schema/filters/types";
import { readQuery, writeQuery } from "@pond/schema/filters/url";
import { Menu, Tooltip } from "@pond/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appendPredicate } from "@/components/filter-bar/helpers";
import {
  AddFilterMenu,
  useFilterHotkey,
} from "@/components/filter-bar/registry";
import { LayoutPopover } from "@/components/layout-popover";
import { SavedFilters } from "@/components/saved-filters";
import styles from "./styles.module.css";

const SEARCH_DEBOUNCE_MS = 150;

function Root() {
  const [params, setParams] = useSearchParams();
  const [zoom, setZoom] = useZoom();

  // Local state for the search input — the URL is the source of truth
  // for the *committed* query, but we keep keystrokes local and only
  // write to `useSearchParams` after the user stops typing. Writing
  // every keystroke to the URL re-runs every consumer of
  // `useSearchParams` (this toolbar, FilterBar, SavesView, …) on each
  // character, which is the noisiest source of chrome re-renders
  // while the library is live.
  const urlSearch = params.get("q") ?? "";
  const [search, setSearchLocal] = useState(urlSearch);
  useEffect(() => {
    setSearchLocal(urlSearch);
  }, [urlSearch]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setSearchLocal(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Function form so we read the freshest params at write time —
        // avoids clobbering filter chips the user might have toggled
        // mid-typing.
        setParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            if (next) p.set("q", next);
            else p.delete("q");
            return p;
          },
          { replace: true },
        );
      }, SEARCH_DEBOUNCE_MS);
    },
    [setParams],
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const addFilter = useCallback(
    (predicate: Predicate) => {
      const current = readQuery(params);
      const next = appendPredicate(
        current.kind === "and" ? current : EMPTY_QUERY,
        predicate,
      );
      setParams(writeQuery(params, next), { replace: true });
    },
    [params, setParams],
  );

  useFilterHotkey(() => {
    setFilterOpen(true);
    requestAnimationFrame(() => filterInputRef.current?.focus());
  });

  return (
    <Toolbar>
      <Search>
        <SearchIcon>
          <IconMagnifierOutline18 width="0.85em" height="0.85em" />
        </SearchIcon>
        <SearchInput
          type="search"
          placeholder="Search"
          value={search}
          onChange={onSearchChange}
          aria-label="Search saves"
        />
      </Search>

      <Right>
        <ZoomControls value={zoom} onChange={setZoom} />
        <SavedFilters.Root />
        <Tooltip.Root content="View options" side="bottom">
          <LayoutPopover.Root
            trigger={
              <IconButton aria-label="View options">
                <IconGridOutline18 width="0.95em" height="0.95em" />
              </IconButton>
            }
          />
        </Tooltip.Root>
        <Tooltip.Root content="Add filter" side="bottom">
          <Menu.Root open={filterOpen} onOpenChange={setFilterOpen}>
            <Menu.Trigger
              render={
                <IconButton aria-label="Add filter">
                  <IconBarsFilterOutline18 width="0.95em" height="0.95em" />
                </IconButton>
              }
            />
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={6}>
                <Menu.Popup>
                  <AddFilterMenu
                    onCommit={addFilter}
                    inputRef={filterInputRef}
                  />
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Tooltip.Root>
      </Right>
    </Toolbar>
  );
}

interface ToolbarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Library toolbar"
      className={[styles.toolbar, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface SearchProps extends React.ComponentPropsWithoutRef<"div"> {}

function Search({ className, ...props }: SearchProps) {
  return (
    <div
      className={[styles.search, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface SearchIconProps extends React.ComponentPropsWithoutRef<"span"> {}

function SearchIcon({ className, ...props }: SearchIconProps) {
  return (
    <span
      aria-hidden
      className={[styles["search-icon"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface SearchInputProps extends React.ComponentPropsWithoutRef<"input"> {}

function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <input
      className={[styles["search-input"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface RightProps extends React.ComponentPropsWithoutRef<"div"> {}

function Right({ className, ...props }: RightProps) {
  return (
    <div
      className={[styles.right, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface IconButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  "data-active"?: "true" | undefined;
}

function IconButton({ className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={[styles["icon-btn"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export const HeaderToolbar = {
  Root,
  Toolbar,
  Search,
  SearchIcon,
  SearchInput,
  Right,
  IconButton,
};

const ZOOM_MIN = 80;
const ZOOM_MAX = 240;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 130;

interface ZoomControlsProps {
  value: number;
  onChange: (next: number) => void;
}

/**
 * Eagle-style zoom slider for the grid. Drives `--grid-min`, which the
 * masonry packer and CSS layouts already react to. Higher value = wider
 * minimum column = fewer columns + bigger cards (the column count steps
 * down at thresholds the same way `repeat(auto-fit, minmax(N, 1fr))`
 * does).
 */
function ZoomControls({ value, onChange }: ZoomControlsProps) {
  const clamp = useCallback(
    (n: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)),
    [],
  );
  const step = useCallback(
    (delta: number) => onChange(clamp(value + delta)),
    [clamp, onChange, value],
  );
  return (
    <fieldset className={styles.zoom}>
      <legend className={styles["sr-only"]}>Grid zoom</legend>
      <Tooltip.Root content="Smaller cards" side="bottom">
        <IconButton
          aria-label="Smaller cards"
          onClick={() => step(-ZOOM_STEP)}
          disabled={value <= ZOOM_MIN}
        >
          <IconMinusOutline18 width="0.85em" height="0.85em" />
        </IconButton>
      </Tooltip.Root>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label="Grid zoom"
        className={styles["zoom-slider"]}
      />
      <Tooltip.Root content="Larger cards" side="bottom">
        <IconButton
          aria-label="Larger cards"
          onClick={() => step(ZOOM_STEP)}
          disabled={value >= ZOOM_MAX}
        >
          <IconPlusOutline18 width="0.85em" height="0.85em" />
        </IconButton>
      </Tooltip.Root>
    </fieldset>
  );
}

/**
 * Hook that keeps the grid tile size pref in sync with localStorage and
 * the `--grid-min` CSS variable. Consumed by the zoom slider above and
 * any future keyboard / command-palette shortcuts.
 */
function useZoom(): [number, (next: number) => void] {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof window === "undefined") return ZOOM_DEFAULT;
    const raw = window.localStorage.getItem("pond.gridZoom");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : ZOOM_DEFAULT;
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--grid-min", `${zoom}px`);
    try {
      window.localStorage.setItem("pond.gridZoom", String(zoom));
    } catch {
      /* fail silently if storage is denied */
    }
  }, [zoom]);

  return [zoom, setZoomState];
}
