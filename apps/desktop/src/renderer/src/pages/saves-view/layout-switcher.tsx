import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowData,
  type SortingFn,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, type CardLayout } from "@/components/card-thumb";
import { type GridLayout, Library } from "@/components/library";
import { readViewPref, writeViewPref } from "@/lib/view-prefs";
import type { Save } from "@/pool/types";
import { JustifiedView } from "./justified";
import {
  extensionFor,
  formatAbsolute,
  formatBytes,
  SaveCard,
} from "./save-card";
import styles from "./styles.module.css";
import { WaterfallView } from "./waterfall";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

export type ViewMode =
  | "waterfall"
  | "justified"
  | "grid"
  | "list"
  | "timeline"
  | "color";

interface LayoutSwitcherProps {
  viewMode: ViewMode;
  saves: Save[];
  selectedId: string | null;
  busy: string | null;
  multiSelectActive: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onTrash: (id: string) => void;
}

export function LayoutSwitcher(props: LayoutSwitcherProps) {
  const {
    viewMode,
    saves,
    selectedId,
    busy,
    multiSelectActive,
    onClick,
    onDoubleClick,
    onTrash,
  } = props;

  const renderJustifiedCard = useCallback(
    (save: Save, w: number, h: number) => (
      <SaveCard
        key={save.id}
        save={save}
        selectedId={selectedId}
        busy={busy === save.id}
        multiSelectActive={multiSelectActive}
        layout="justified"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTrash={onTrash}
        packedWidth={w}
        packedHeight={h}
      />
    ),
    [selectedId, busy, multiSelectActive, onClick, onDoubleClick, onTrash],
  );

  const renderWaterfallCard = useCallback(
    (
      save: Save,
      packed: { top: number; left: number; width: number; height: number },
    ) => (
      <SaveCard
        key={save.id}
        save={save}
        selectedId={selectedId}
        busy={busy === save.id}
        multiSelectActive={multiSelectActive}
        layout="waterfall"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTrash={onTrash}
        packedWidth={packed.width}
        packedHeight={packed.height}
        packedTop={packed.top}
        packedLeft={packed.left}
      />
    ),
    [selectedId, busy, multiSelectActive, onClick, onDoubleClick, onTrash],
  );

  if (viewMode === "list") {
    return (
      <ListView
        saves={saves}
        selectedId={selectedId}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (viewMode === "timeline") {
    return (
      <TimelineView
        saves={saves}
        selectedId={selectedId}
        busy={busy}
        multiSelectActive={multiSelectActive}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTrash={onTrash}
      />
    );
  }
  if (viewMode === "color") {
    return (
      <ColorView
        saves={saves}
        selectedId={selectedId}
        busy={busy}
        multiSelectActive={multiSelectActive}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTrash={onTrash}
      />
    );
  }
  if (viewMode === "justified") {
    return (
      <JustifiedView
        saves={saves}
        multiSelectActive={multiSelectActive}
        renderCard={renderJustifiedCard}
      />
    );
  }
  if (viewMode === "waterfall") {
    return (
      <WaterfallView
        saves={saves}
        multiSelectActive={multiSelectActive}
        renderCard={renderWaterfallCard}
      />
    );
  }
  return (
    <Library.Grid
      layout={viewMode as GridLayout}
      multiSelect={multiSelectActive}
    >
      {saves.map((save) => (
        <SaveCard
          key={save.id}
          save={save}
          selectedId={selectedId}
          busy={busy === save.id}
          multiSelectActive={multiSelectActive}
          layout={viewMode as CardLayout}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onTrash={onTrash}
        />
      ))}
    </Library.Grid>
  );
}

interface GroupViewProps {
  saves: Save[];
  selectedId: string | null;
  busy: string | null;
  multiSelectActive: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onTrash: (id: string) => void;
}

function useGroupedWaterfallRenderer({
  selectedId,
  busy,
  multiSelectActive,
  onClick,
  onDoubleClick,
  onTrash,
}: Omit<GroupViewProps, "saves">) {
  return useCallback(
    (
      save: Save,
      packed: { top: number; left: number; width: number; height: number },
    ) => (
      <SaveCard
        key={save.id}
        save={save}
        selectedId={selectedId}
        busy={busy === save.id}
        multiSelectActive={multiSelectActive}
        layout="waterfall"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTrash={onTrash}
        packedWidth={packed.width}
        packedHeight={packed.height}
        packedTop={packed.top}
        packedLeft={packed.left}
      />
    ),
    [selectedId, busy, multiSelectActive, onClick, onDoubleClick, onTrash],
  );
}

type SortKey =
  | "title"
  | "tags"
  | "dimensions"
  | "extension"
  | "fileSize"
  | "savedAt";

const SORT_KEYS = new Set<SortKey>([
  "title",
  "tags",
  "dimensions",
  "extension",
  "fileSize",
  "savedAt",
]);

// Locale-aware string comparator. TanStack's built-in `text` sorting fn
// uses an alphanumeric chunked comparison that diverges from plain
// localeCompare; this preserves the old ordering.
const localeSort: SortingFn<Save> = (a, b, columnId) => {
  const va = a.getValue<string>(columnId);
  const vb = b.getValue<string>(columnId);
  return va.localeCompare(vb);
};

function ListView({
  saves,
  selectedId,
  onClick,
  onDoubleClick,
}: {
  saves: Save[];
  selectedId: string | null;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const rawSort = params.get("sort") ?? readViewPref("sort") ?? "savedAt";
  const sortKey: SortKey = SORT_KEYS.has(rawSort as SortKey)
    ? (rawSort as SortKey)
    : "savedAt";
  const rawDir = params.get("dir") ?? readViewPref("dir");
  const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";

  const sorting = useMemo<SortingState>(
    () => [{ id: sortKey, desc: sortDir === "desc" }],
    [sortKey, sortDir],
  );

  // First-click direction policy lives on each column's `sortDescFirst`.
  // We just mirror TanStack's state back into the URL.
  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const item = next[0] ?? sorting[0];
      if (!item) return;
      const dir: "asc" | "desc" = item.desc ? "desc" : "asc";
      const p = new URLSearchParams(params);
      p.set("sort", item.id);
      p.set("dir", dir);
      setParams(p, { replace: true });
      writeViewPref("sort", item.id);
      writeViewPref("dir", dir);
    },
    [params, setParams, sorting],
  );

  const columns = useMemo(() => {
    const helper = createColumnHelper<Save>();
    return [
      helper.display({
        id: "thumbnail",
        header: () => null,
        cell: ({ row }) => (
          <span className={styles["list-thumb"]}>
            <Card.Root save={row.original}>
              <Card.Media />
              <Card.DownloadingBadge />
            </Card.Root>
          </span>
        ),
        enableSorting: false,
        meta: { className: styles["col-thumb"] },
      }),
      helper.accessor((save) => (save.title ?? save.url ?? "").toLowerCase(), {
        id: "title",
        header: "Name",
        cell: ({ row }) => row.original.title ?? row.original.url,
        sortingFn: localeSort,
        sortDescFirst: false,
        meta: { className: styles["col-name"] },
      }),
      helper.accessor((save) => save.tags.join(",").toLowerCase(), {
        id: "tags",
        header: "Tags",
        cell: ({ row }) => {
          const save = row.original;
          if (save.tags.length === 0) {
            return <span className={styles["col-muted"]}>—</span>;
          }
          return (
            <span className={styles["tag-chips"]}>
              {save.tags.slice(0, 6).map((t) => (
                <span key={t} className={styles["tag-chip"]}>
                  {t}
                </span>
              ))}
              {save.tags.length > 6 ? (
                <span className={styles["tag-chip-more"]}>
                  +{save.tags.length - 6}
                </span>
              ) : null}
            </span>
          );
        },
        sortingFn: localeSort,
        sortDescFirst: false,
        meta: { className: styles["col-tags"] },
      }),
      helper.accessor(
        (save) => {
          const cover = save.files[save.coverIndex ?? 0];
          const w = cover?.width ?? save.width ?? null;
          const h = cover?.height ?? save.height ?? null;
          return w && h ? w * h : undefined;
        },
        {
          id: "dimensions",
          header: "Dimensions",
          cell: ({ row }) => {
            const save = row.original;
            const cover = save.files[save.coverIndex ?? 0];
            if (cover?.width && cover?.height) {
              return `${cover.width} × ${cover.height}`;
            }
            if (save.width && save.height) {
              return `${save.width} × ${save.height}`;
            }
            return "—";
          },
          sortingFn: "basic",
          sortUndefined: "last",
          sortDescFirst: false,
          meta: { className: styles["col-dim"] },
        },
      ),
      helper.accessor((save) => extensionFor(save), {
        id: "extension",
        header: "Extension",
        cell: ({ row }) => {
          const ext = extensionFor(row.original).toUpperCase();
          return ext ? <span className={styles["ext-chip"]}>{ext}</span> : "—";
        },
        sortingFn: localeSort,
        sortDescFirst: false,
        meta: { className: styles["col-ext"] },
      }),
      helper.accessor(
        (save) => {
          const cover = save.files[save.coverIndex ?? 0];
          const v = cover?.size ?? save.fileSize ?? null;
          return v == null ? undefined : v;
        },
        {
          id: "fileSize",
          header: "File Size",
          cell: ({ row }) => {
            const save = row.original;
            const cover = save.files[save.coverIndex ?? 0];
            return formatBytes(cover?.size ?? save.fileSize ?? null);
          },
          sortingFn: "basic",
          sortUndefined: "last",
          sortDescFirst: true,
          meta: { className: styles["col-size"] },
        },
      ),
      helper.accessor(
        (save) => {
          const t = new Date(save.savedAt).getTime();
          return Number.isFinite(t) ? t : undefined;
        },
        {
          id: "savedAt",
          header: "Date Added",
          cell: ({ row }) => formatAbsolute(row.original.savedAt),
          sortingFn: "basic",
          sortUndefined: "last",
          sortDescFirst: true,
          meta: { className: styles["col-date"] },
        },
      ),
    ];
  }, []);

  const table = useReactTable({
    data: saves,
    columns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
    enableSortingRemoval: false,
  });

  return (
    <table className={styles.table}>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((header) => {
              const className = header.column.columnDef.meta?.className;
              if (header.column.id === "thumbnail") {
                return (
                  <th
                    key={header.id}
                    aria-label="Thumbnail"
                    className={className}
                  />
                );
              }
              const sortedDir = header.column.getIsSorted();
              const ariaSort: "ascending" | "descending" | "none" =
                sortedDir === "asc"
                  ? "ascending"
                  : sortedDir === "desc"
                    ? "descending"
                    : "none";
              return (
                <th key={header.id} className={className} aria-sort={ariaSort}>
                  <button
                    type="button"
                    className={styles["col-header"]}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {sortedDir ? (
                      <span aria-hidden className={styles["sort-indicator"]}>
                        {sortedDir === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const save = row.original;
          return (
            <tr
              key={save.id}
              aria-selected={save.id === selectedId}
              onClick={(e) => onClick(save.id, e)}
              onDoubleClick={() => onDoubleClick(save.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                void window.pond.showSaveContextMenu(save.id);
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TimelineView(props: GroupViewProps) {
  const groups = useMemo(() => {
    const buckets = new Map<string, Save[]>();
    for (const s of props.saves) {
      const d = new Date(s.savedAt);
      const key = Number.isFinite(d.getTime())
        ? d.toISOString().slice(0, 10)
        : "unknown";
      const list = buckets.get(key) ?? [];
      list.push(s);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [props.saves]);
  const renderCard = useGroupedWaterfallRenderer(props);
  return (
    <div className={styles.timeline}>
      {groups.map(([day, items]) => (
        <section key={day} className={styles["timeline-section"]}>
          <h3 className={styles["timeline-heading"]}>{formatDay(day)}</h3>
          <WaterfallView
            saves={items}
            multiSelectActive={props.multiSelectActive}
            renderCard={renderCard}
          />
        </section>
      ))}
    </div>
  );
}

function ColorView(props: GroupViewProps) {
  const groups = useMemo(() => {
    const buckets = new Map<string, Save[]>();
    for (const s of props.saves) {
      const top = s.dominantColors?.[0]?.hex;
      const bucket = top ? bucketHue(top) : "other";
      const list = buckets.get(bucket) ?? [];
      list.push(s);
      buckets.set(bucket, list);
    }
    const order = [
      "red",
      "orange",
      "yellow",
      "green",
      "cyan",
      "blue",
      "purple",
      "pink",
      "brown",
      "gray",
      "black",
      "white",
      "other",
    ];
    return Array.from(buckets.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [props.saves]);
  const renderCard = useGroupedWaterfallRenderer(props);
  return (
    <div className={styles.timeline}>
      {groups.map(([bucket, items]) => (
        <section key={bucket} className={styles["timeline-section"]}>
          <h3 className={styles["timeline-heading"]}>
            <span
              className={styles.swatch}
              style={{ background: bucketSwatch(bucket) }}
              aria-hidden
            />
            {bucket}
            <span className={styles["timeline-count"]}>{items.length}</span>
          </h3>
          <WaterfallView
            saves={items}
            multiSelectActive={props.multiSelectActive}
            renderCard={renderCard}
          />
        </section>
      ))}
    </div>
  );
}

function formatDay(iso: string): string {
  if (iso === "unknown") return "Undated";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const today = new Date();
  const sameYear = d.getFullYear() === today.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { weekday: "long", month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

function bucketHue(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "other";
  const v = m[1];
  if (!v) return "other";
  const r = Number.parseInt(v.slice(0, 2), 16) / 255;
  const g = Number.parseInt(v.slice(2, 4), 16) / 255;
  const b = Number.parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  if (l < 0.08) return "black";
  if (l > 0.92) return "white";
  if (s < 0.12) return "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  if (h < 345) return "pink";
  return "other";
}

function bucketSwatch(bucket: string): string {
  switch (bucket) {
    case "red":
      return "#ff3b30";
    case "orange":
      return "#ff9500";
    case "yellow":
      return "#ffd60a";
    case "green":
      return "#34c759";
    case "cyan":
      return "#5ac8fa";
    case "blue":
      return "#007aff";
    case "purple":
      return "#af52de";
    case "pink":
      return "#ff2d55";
    case "brown":
      return "#a2845e";
    case "gray":
      return "#8e8e93";
    case "black":
      return "#1c1c1e";
    case "white":
      return "#fafafa";
    default:
      return "#c7c7cc";
  }
}
