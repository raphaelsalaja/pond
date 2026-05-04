import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tooltip } from "../../ui";
import {
  ArrowsCycleIcon,
  FilterToggleIcon,
  GridViewIcon,
  HeaderPlusIcon,
  JustifiedViewIcon,
  ListViewIcon,
  PinIcon,
  SearchIcon,
  SidebarToggleIcon,
  WaterfallViewIcon,
  ZoomMinusIcon,
  ZoomPlusIcon,
} from "../filter-bar/icons";
import styles from "./styles.module.css";

/**
 * Eagle-style top toolbar that sits inside `.pond-header`. From left
 * to right:
 *
 *   [+ refresh sidebar] [zoom slider] [view filter search pin]
 *
 * The toolbar is informational+navigational only — the actual filter
 * chips live in `<FilterBar>` immediately below. We keep the two
 * surfaces split so the chip rail can be toggled independently of
 * the toolbar (the funnel button on the right hides/shows it).
 *
 * Most secondary buttons (`+`, sidebar toggle, list view, pin) are
 * intentionally inert today — they're scaffolded so the chrome looks
 * complete; the wires get added when the underlying features land.
 */

export interface HeaderToolbarProps {
  /** Toggled by the funnel button. Lifted up so `<App>` can hide the
   * filter rail entirely when off. */
  filtersVisible: boolean;
  onToggleFilters: () => void;
}

export function HeaderToolbar({
  filtersVisible,
  onToggleFilters,
}: HeaderToolbarProps) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [zoom, setZoom] = useZoom();
  const view = (params.get("view") ?? "waterfall") as
    | "waterfall"
    | "justified"
    | "grid"
    | "list"
    | "timeline"
    | "color";
  const search = params.get("q") ?? "";

  function setSearch(next: string) {
    const p = new URLSearchParams(params);
    if (next) p.set("q", next);
    else p.delete("q");
    setParams(p, { replace: true });
  }

  const setView = useCallback(
    (
      next: "waterfall" | "justified" | "grid" | "list" | "timeline" | "color",
    ) => {
      const p = new URLSearchParams(params);
      if (next === "waterfall") p.delete("view");
      else p.set("view", next);
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  function notify() {
    /* placeholder for unwired buttons */
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Library toolbar">
      <div className={styles.left}>
        <Tooltip content="New save" side="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="New save"
            onClick={notify}
          >
            <HeaderPlusIcon width="0.95em" height="0.95em" />
          </button>
        </Tooltip>
        <Tooltip content="Reload library" side="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Reload"
            onClick={() => navigate(0)}
          >
            <ArrowsCycleIcon width="0.95em" height="0.95em" />
          </button>
        </Tooltip>
        <Tooltip content="Toggle sidebar" side="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Toggle sidebar"
            onClick={notify}
          >
            <SidebarToggleIcon width="0.95em" height="0.95em" />
          </button>
        </Tooltip>
      </div>

      <div className={styles.centre}>
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label="Smaller tiles"
            onClick={() => setZoom(Math.max(80, zoom - 20))}
          >
            <ZoomMinusIcon width="0.7em" height="0.7em" />
          </button>
          <input
            type="range"
            min={80}
            max={280}
            step={10}
            value={zoom}
            aria-label="Tile size"
            onChange={(e) => setZoom(Number(e.target.value))}
            className={styles.zoomSlider}
          />
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label="Larger tiles"
            onClick={() => setZoom(Math.min(280, zoom + 20))}
          >
            <ZoomPlusIcon width="0.7em" height="0.7em" />
          </button>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.viewToggle}>
          <Tooltip content="Waterfall view" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "waterfall" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Waterfall view"
              aria-pressed={view === "waterfall"}
              onClick={() => setView("waterfall")}
            >
              <WaterfallViewIcon width="0.95em" height="0.95em" />
            </button>
          </Tooltip>
          <Tooltip content="Justified view" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "justified" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Justified view"
              aria-pressed={view === "justified"}
              onClick={() => setView("justified")}
            >
              <JustifiedViewIcon width="0.95em" height="0.95em" />
            </button>
          </Tooltip>
          <Tooltip content="Grid view" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "grid" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <GridViewIcon width="0.95em" height="0.95em" />
            </button>
          </Tooltip>
          <Tooltip content="List view" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "list" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <ListViewIcon width="0.95em" height="0.95em" />
            </button>
          </Tooltip>
          <span className={styles.viewToggleDivider} aria-hidden />
          <Tooltip content="Timeline (group by save date)" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "timeline" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Timeline view"
              aria-pressed={view === "timeline"}
              onClick={() => setView("timeline")}
            >
              <span aria-hidden style={{ fontSize: 11, fontWeight: 600 }}>
                ☷
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Group by dominant color" side="bottom">
            <button
              type="button"
              className={[
                styles.iconBtn,
                view === "color" ? styles.iconBtnActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Color view"
              aria-pressed={view === "color"}
              onClick={() => setView("color")}
            >
              <span aria-hidden style={{ fontSize: 12, fontWeight: 600 }}>
                ◐
              </span>
            </button>
          </Tooltip>
        </div>

        <Tooltip
          content={filtersVisible ? "Hide filters" : "Show filters"}
          side="bottom"
        >
          <button
            type="button"
            className={[
              styles.iconBtn,
              filtersVisible ? styles.iconBtnActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Toggle filters"
            aria-pressed={filtersVisible}
            onClick={onToggleFilters}
          >
            <FilterToggleIcon width="0.95em" height="0.95em" />
          </button>
        </Tooltip>

        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden>
            <SearchIcon width="0.85em" height="0.85em" />
          </span>
          <input
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            aria-label="Search saves"
          />
        </div>

        <Tooltip content="Pin (coming soon)" side="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Pin"
            onClick={notify}
          >
            <PinIcon width="0.95em" height="0.95em" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Hook that owns the grid tile size. Persists to localStorage so the
 * pref survives reloads, and writes a CSS custom property on the
 * document root so `pond-grid` reads it without any prop drilling.
 *
 * `--pond-grid-min` plays a different role per layout mode:
 *   - waterfall → column width (the IMAGE grows in width, height
 *     follows from each cover's natural aspect ratio).
 *   - justified → row height (each row of cards is this tall, widths
 *     vary with aspect to pack flush).
 *   - grid       → cell min-width and (square) cell height — the
 *     classic Eagle "uniform tiles" zoom.
 */
function useZoom(): [number, (next: number) => void] {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof window === "undefined") return 130;
    const raw = window.localStorage.getItem("pond.gridZoom");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 130;
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--pond-grid-min", `${zoom}px`);
    try {
      window.localStorage.setItem("pond.gridZoom", String(zoom));
    } catch {
      /* fail silently if storage is denied */
    }
  }, [zoom]);

  return [zoom, setZoomState];
}
