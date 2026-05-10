import { readQuery } from "@pond/schema/filters/url";
import { Tooltip, useToast } from "@pond/ui";
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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Card,
  type CardLayout,
  type CardSelection,
  isTextOnlyTweet,
} from "@/components/card-thumb";
import { type GridLayout, Library } from "@/components/library";
import { useRecents } from "@/components/recents";
import { LibraryChrome, Shell } from "@/components/shell";
import { SourceBadge } from "@/components/source-badge";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { readViewPref, writeViewPref } from "@/lib/view-prefs";
import { SaveDetail } from "@/pages/save-detail";
import { optimistic } from "@/pool/bootstrap";
import { useBootReady, useSaves } from "@/pool/hooks";
import { pool } from "@/pool/pool";
import { useSearchResults } from "@/pool/search";
import { selection, useIsSelected, useSelectionSize } from "@/pool/selection";
import type { Save } from "@/pool/types";
import { useFilteredSaves } from "@/pool/use-filtered-saves";
import { JustifiedView } from "./justified";
import styles from "./styles.module.css";
import { WaterfallView } from "./waterfall";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

interface SavesViewProps {
  /**
   * - `library`  — every active save (default).
   * - `source`   — active saves whose `source` matches `:source` param.
   * - `untagged` — active saves that have no tags yet.
   * - `recents`  — saves you've recently opened, ordered by last visit.
   * - `random`   — every active save in a stable shuffled order (per mount).
   */
  mode?: "library" | "source" | "untagged" | "recents" | "random";
}

/**
 * Library / Source view. Reads the full pool and applies a
 * mode-specific filter.
 *
 * Optional `?tag=<tag>` query param narrows further; the sidebar tag
 * chips drive that. `<TweetCard>` keeps its own card chrome for
 * `save.source === "twitter"`; everything else uses the Eagle-style
 * tile from `Library.Item.*`.
 */
export function SavesView({ mode = "library" }: SavesViewProps) {
  const saves = useSaves();
  const bootReady = useBootReady();
  const params = useParams<{ source?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const query = useMemo(() => readQuery(searchParams), [searchParams]);
  const q = searchParams.get("q") ?? "";
  const [busy, setBusy] = useState<string | null>(null);

  const sourceFilter = mode === "source" ? (params.source ?? "") : "";
  const selectedId = params.id ?? null;
  const recents = useRecents();
  const recentsOrder = useMemo(() => {
    if (mode !== "recents") return null;
    const map = new Map<string, number>();
    for (let i = 0; i < recents.length; i++) {
      const entry = recents[i];
      if (entry) map.set(entry.saveId, i);
    }
    return map;
  }, [mode, recents]);

  const randomSeed = useMemo(() => Math.random().toString(36).slice(2), []);
  const viewMode = (searchParams.get("view") ??
    readViewPref("view") ??
    "waterfall") as
    | "waterfall"
    | "justified"
    | "grid"
    | "list"
    | "timeline"
    | "color";
  const selectionSize = useSelectionSize();
  const multiSelectActive = selectionSize > 0;

  // Strip any trailing `/save/:id` so re-selecting from a detail URL
  // doesn't double up. Result is the parent list URL — `/`, `/source/...`,
  // `/trash` — that we'll re-anchor the new save segment onto.
  const listBase = location.pathname.replace(/\/save\/[^/]+\/?$/, "") || "/";
  const buildSavePath = useCallback(
    (id: string) =>
      listBase === "/" ? `/save/${id}` : `${listBase}/save/${id}`,
    [listBase],
  );
  const buildDetailPath = useCallback(
    (id: string) =>
      listBase === "/" ? `/detail/${id}` : `${listBase}/detail/${id}`,
    [listBase],
  );

  const select = useCallback(
    (id: string) => {
      navigate(buildSavePath(id));
    },
    [buildSavePath, navigate],
  );

  // Double-click opens the full detail page. Filter / search params on
  // the parent list URL come along so pagination, sort and breadcrumb
  // re-derive the same view the user came from.
  const focus = useCallback(
    (id: string) => {
      navigate({
        pathname: buildDetailPath(id),
        search: searchParams.toString(),
      });
    },
    [buildDetailPath, navigate, searchParams],
  );

  // FTS5-backed search; returns `null` when the query is empty and we
  // should fall back to the in-memory pool snapshot. Searches index
  // title / description / author / OCR / AI caption / AI summary /
  // article body / tag names — strictly more than the previous JS
  // substring filter ever did.
  const search = useSearchResults(q);

  const narrowed = useMemo(() => {
    const base = search.results ?? saves;
    const filteredList = base.filter((save) => {
      if (save.deletedAt) return false;
      if (sourceFilter && save.source.toLowerCase() !== sourceFilter) {
        return false;
      }
      if (mode === "untagged" && save.tags.length > 0) return false;
      if (mode === "recents" && !recentsOrder?.has(save.id)) return false;
      return true;
    });

    if (mode === "recents" && recentsOrder) {
      // Most-recently-visited first; recordVisit() puts the latest entry
      // at index 0 so we can sort by the recents map directly.
      return filteredList.sort(
        (a, b) =>
          (recentsOrder.get(a.id) ?? Infinity) -
          (recentsOrder.get(b.id) ?? Infinity),
      );
    }

    if (mode === "random") {
      // Stable shuffle: hash each save id together with a per-mount seed
      // so the order survives re-renders but resets when you re-enter
      // /random.
      return filteredList.sort(
        (a, b) =>
          hashShuffleKey(a.id, randomSeed) - hashShuffleKey(b.id, randomSeed),
      );
    }

    return filteredList;
  }, [saves, search.results, sourceFilter, mode, recentsOrder, randomSeed]);

  // Recents and random modes carry their own ordering inside
  // `narrowed`; ignore the URL sort there so the toolbar can't fight
  // those views' intentional shuffles. Everything else honours
  // `?sort` + `?dir` so the View options popover is meaningful for
  // grid views, not just list.
  const sortOpts = useMemo(() => {
    if (mode === "recents" || mode === "random") return undefined;
    const rawSort =
      searchParams.get("sort") ?? readViewPref("sort") ?? "savedAt";
    const sortKey: "savedAt" | "title" | "fileSize" =
      rawSort === "title" || rawSort === "fileSize" ? rawSort : "savedAt";
    const rawDir = searchParams.get("dir") ?? readViewPref("dir");
    const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
    return { sortKey, sortDir };
  }, [mode, searchParams]);

  const filtered = useFilteredSaves(narrowed, query, sortOpts);

  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);

  /**
   * Cmd-click toggles the row in/out of the multi-select set; Shift-click
   * extends a contiguous range from the anchor; plain click drops any
   * pending selection and falls through to the single-preview path.
   */
  const handleCardClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      if (meta) {
        e.preventDefault();
        selection.toggle(id);
        if (selection.has(id)) selection.setAnchor(id);
        return;
      }
      if (shift) {
        e.preventDefault();
        const anchor = selection.getAnchor() ?? id;
        selection.setRange(filteredIds, anchor, id);
        return;
      }
      if (multiSelectActive) selection.clear();
      selection.setAnchor(id);
      select(id);
    },
    [filteredIds, multiSelectActive, select],
  );

  // Cmd-A selects every visible card; Esc clears the selection. Wired
  // window-wide because the grid itself doesn't sit behind a focus trap
  // and we want the shortcut to work regardless of where focus lives.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !isInput) {
        if (filteredIds.length === 0) return;
        e.preventDefault();
        selection.set(filteredIds);
        return;
      }
      if (e.key === "Escape" && selectionSize > 0) {
        selection.clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredIds, selectionSize]);

  // Drop the selection whenever the route mode or source-filter changes
  // — selecting items in /source/twitter and then jumping to /trash
  // should not carry that selection along. We read both deps inside so
  // the analyzer recognises them as effect inputs.
  useEffect(() => {
    void mode;
    void sourceFilter;
    selection.clear();
  }, [mode, sourceFilter]);

  // Stable across renders so `<SaveCard onTrash={...}>` can rely on
  // React.memo bailing when nothing else changed. `setBusy` is a
  // useState setter (stable). `toast` is the Base UI manager
  // (stable for the lifetime of the provider).
  const moveToTrash = useCallback(
    async (id: string) => {
      const prev = pool.get(id);
      if (!prev) return;
      const nowIso = new Date().toISOString();
      setBusy(id);
      try {
        await optimistic(
          () => {
            pool.upsert({ ...prev, deletedAt: nowIso } as typeof prev);
          },
          () => {
            pool.upsert(prev);
          },
          async () =>
            window.pond.tx({
              kind: "trash",
              model: "save",
              id,
            }),
        );
        toast.add({ title: "Moved to trash", type: "success" });
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types ?? []);
    if (
      types.includes("text/uri-list") ||
      types.includes("text/plain") ||
      types.includes("Files")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (!dt) return;

      // Native files first — Electron exposes a real on-disk path on
      // each File so we can hand it straight to the ingest pipeline.
      const files = Array.from(dt.files ?? []) as Array<
        File & { path?: string }
      >;
      const items = files
        .map((f) => ({
          path: f.path ?? "",
          name: f.name,
          type: f.type,
        }))
        .filter((it) => it.path);
      if (items.length > 0) {
        const result = (await window.pond.query("saves.dropFiles", {
          items,
        })) as { ok: boolean; ids?: string[] };
        if (result.ok && (result.ids?.length ?? 0) > 0) {
          toast.add({
            title: `Imported ${result.ids?.length} file${result.ids?.length === 1 ? "" : "s"}`,
            type: "success",
          });
        }
        return;
      }

      const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
      if (uri) {
        const lines = uri
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        for (const line of lines) {
          await window.pond.query("saves.quickAdd", { url: line });
        }
        if (lines.length > 0) {
          toast.add({
            title: `Saved ${lines.length} link${lines.length === 1 ? "" : "s"}`,
            type: "success",
          });
        }
      }
    },
    [toast],
  );

  const renderJustifiedCard = useCallback(
    (save: Save, w: number, h: number) => (
      <SaveCard
        key={save.id}
        save={save}
        selectedId={selectedId}
        busy={busy === save.id}
        multiSelectActive={multiSelectActive}
        layout="justified"
        onClick={handleCardClick}
        onDoubleClick={focus}
        onTrash={moveToTrash}
        packedWidth={w}
        packedHeight={h}
      />
    ),
    [selectedId, busy, multiSelectActive, handleCardClick, focus, moveToTrash],
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
        onClick={handleCardClick}
        onDoubleClick={focus}
        onTrash={moveToTrash}
        packedWidth={packed.width}
        packedHeight={packed.height}
        packedTop={packed.top}
        packedLeft={packed.left}
      />
    ),
    [selectedId, busy, multiSelectActive, handleCardClick, focus, moveToTrash],
  );

  // Map the legacy view modes onto the simplified Library context. The
  // group / waterfall / justified / color paths still render their own
  // wrappers below — Library.Root is the canonical wrapper for the
  // grid + list pair we expose in the UI.
  const libraryView = viewMode === "list" ? "list" : "grid";

  return (
    <>
      <Shell.Main>
        <LibraryChrome />
        <Library.Root
          view={libraryView}
          onDragOver={onDragOver}
          onDrop={(e) => void onDrop(e)}
        >
          {filtered.length === 0 ? (
            // Stay silent while the pool is hydrating from the local
            // cache + reconciling against main. Without this gate a
            // cold cache (first launch, post-clear) flashes the "No
            // matches" copy in the moment between mount and the live
            // SQLite snapshot landing — misleading because the user
            // hasn't actually filtered anything down.
            !bootReady ? null : saves.length === 0 ? (
              <Library.Empty>
                No saves yet. Drop a link, image, or file to get started.
              </Library.Empty>
            ) : (
              <Library.Empty>
                No matches. Try a different search or clear the filter.
              </Library.Empty>
            )
          ) : viewMode === "list" ? (
            <ListView
              saves={filtered}
              selectedId={selectedId}
              onClick={handleCardClick}
              onDoubleClick={focus}
            />
          ) : viewMode === "timeline" ? (
            <TimelineView
              saves={filtered}
              selectedId={selectedId}
              busy={busy}
              multiSelectActive={multiSelectActive}
              onClick={handleCardClick}
              onDoubleClick={focus}
              onTrash={moveToTrash}
            />
          ) : viewMode === "color" ? (
            <ColorView
              saves={filtered}
              selectedId={selectedId}
              busy={busy}
              multiSelectActive={multiSelectActive}
              onClick={handleCardClick}
              onDoubleClick={focus}
              onTrash={moveToTrash}
            />
          ) : viewMode === "justified" ? (
            <JustifiedView
              saves={filtered}
              multiSelectActive={multiSelectActive}
              renderCard={renderJustifiedCard}
            />
          ) : viewMode === "waterfall" ? (
            <WaterfallView
              saves={filtered}
              multiSelectActive={multiSelectActive}
              renderCard={renderWaterfallCard}
            />
          ) : (
            <Library.Grid
              layout={viewMode as GridLayout}
              multiSelect={multiSelectActive}
            >
              {filtered.map((save) => (
                <SaveCard
                  key={save.id}
                  save={save}
                  selectedId={selectedId}
                  busy={busy === save.id}
                  multiSelectActive={multiSelectActive}
                  layout={viewMode as CardLayout}
                  onClick={handleCardClick}
                  onDoubleClick={focus}
                  onTrash={moveToTrash}
                />
              ))}
            </Library.Grid>
          )}
        </Library.Root>
      </Shell.Main>
      <SaveDetail />
    </>
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

/**
 * Per-section waterfall renderer used by `TimelineView` / `ColorView`.
 * Each group section gets its own packed grid so cards within a day /
 * hue bucket stay column-balanced and source-ordered. The renderer
 * lives here (not on `WaterfallView`) because it closes over the group
 * view props.
 */
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

/**
 * Eagle-style sortable List view. A real `<table>` (sticky header,
 * zebra-striped rows, accent-tinted selection) with the columns
 * Thumb / Name / Tags / Dimensions / Extension / File Size / Date.
 *
 * Sort state lives in the URL (`?sort=` + `?dir=`) so it survives
 * navigations and shares a link with someone else's pond.
 */
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

/* Locale-aware string comparator. TanStack's built-in `text` sorting fn
 * uses an alphanumeric chunked comparison that diverges from the
 * previous behaviour, which was a plain `String#localeCompare`. We
 * preserve the old ordering by going straight through Intl. */
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

  /* TanStack honours each column's `sortDescFirst` when a fresh column
   * is clicked, so the first-click direction policy (savedAt + fileSize
   * descend first, everything else ascends first) is enforced via the
   * column defs below. We just mirror whatever state TanStack hands us
   * back into the URL — no manual diffing required. */
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

function extensionFor(save: Save): string {
  const cover = save.files[save.coverIndex ?? 0];
  if (cover?.path) {
    const m = /\.([a-z0-9]+)$/i.exec(cover.path);
    if (m?.[1]) return m[1].toLowerCase();
  }
  if (cover?.mimeType) {
    const m = /^[^/]+\/(.+)$/.exec(cover.mimeType);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return "";
}

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Timeline view — saves grouped by saved-on day, in descending order. */
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

/**
 * Color view — saves bucketed by their dominant cover hue. The
 * enrichment worker writes `dominantColors[]`; we coarsen each save's
 * top hex into one of the named buckets so a 12-hex palette becomes
 * a navigable rail of "all the warm reds", "all the muted greens",
 * etc.
 */
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

/**
 * Bucket a hex color into a named hue. Pure-JS, no color-space libs —
 * RGB → HSL via the standard formula then a switch on H/S/L. Good
 * enough for casual grouping; not perceptually uniform.
 */
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

interface SaveCardProps {
  save: Save;
  selectedId: string | null;
  busy: boolean;
  multiSelectActive: boolean;
  /** Active grid layout — drives the thumb's chrome + aspect-ratio
   * rules in `card-thumb/styles.module.css`. */
  layout: CardLayout;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onTrash: (id: string) => void;
  /** Packer-driven outer width / media height in pixels. Used by the
   * waterfall and justified layouts (both pre-compute slot sizes in
   * JS). Numbers — not a style object — so React.memo can shallow-
   * compare reliably. */
  packedWidth?: number;
  packedHeight?: number;
  /** Waterfall packer also publishes an absolute position so the
   * grid stays row-major across resizes. Justified leaves these
   * undefined and lets flex-wrap place its rows. */
  packedTop?: number;
  packedLeft?: number;
}

/**
 * Splitting the card into its own component lets each row subscribe to
 * its individual `useIsSelected` slice without re-rendering every other
 * card on every selection change. Wrapped in `React.memo` — combined
 * with the pool's in-place patching (`pool.ts`) and stable parent
 * callbacks, an unrelated row update no longer re-renders this card.
 */
const SaveCard = memo(function SaveCard({
  save,
  selectedId,
  busy,
  multiSelectActive,
  layout,
  onClick,
  onDoubleClick,
  onTrash,
  packedWidth,
  packedHeight,
  packedTop,
  packedLeft,
}: SaveCardProps) {
  const isMulti = useIsSelected(save.id);
  const isPrimary = selectedId === save.id;
  // Primary wins when both are true — matches the precedence the
  // selection halo had under the old global CSS.
  const cardSelection: CardSelection | undefined = isPrimary
    ? "primary"
    : isMulti
      ? "multi"
      : undefined;

  const liStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (packedWidth == null || packedHeight == null) return undefined;
    const base: React.CSSProperties = {
      width: `${packedWidth}px`,
      ["--packed-h" as never]: `${packedHeight}px`,
    };
    if (packedTop != null && packedLeft != null) {
      base.position = "absolute";
      base.top = `${packedTop}px`;
      base.left = `${packedLeft}px`;
    }
    return base;
  }, [packedWidth, packedHeight, packedTop, packedLeft]);

  return (
    <Library.Item
      selected={isPrimary}
      multi={isMulti}
      dimmed={multiSelectActive && !isMulti}
      style={liStyle}
      draggable={save.files.length > 0}
      onDragStart={(e) => {
        // Hand the drag off to Electron so the OS sees a real `file:`
        // payload (Finder, Mail, Notes, etc. all consume the result
        // verbatim). preventDefault on the synthetic event so the
        // browser's text-drag fallback doesn't double-fire.
        if (save.files.length === 0) return;
        e.preventDefault();
        void window.pond.query("saves.startDrag", {
          id: save.id,
          fileIndex: save.coverIndex ?? 0,
        });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        void window.pond.showSaveContextMenu(save.id);
      }}
    >
      <Library.Item.Checkbox
        checked={isMulti}
        aria-label={isMulti ? "Deselect" : "Select"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          selection.toggle(save.id);
          if (selection.has(save.id)) selection.setAnchor(save.id);
        }}
      />
      <Library.Item.Select
        aria-pressed={isPrimary}
        onClick={(e) => onClick(save.id, e)}
        onDoubleClick={() => onDoubleClick(save.id)}
      >
        <SaveCardBody save={save} layout={layout} selection={cardSelection} />
      </Library.Item.Select>
      <Tooltip.Root content="Move to Trash">
        <Library.Item.Delete
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            onTrash(save.id);
          }}
          aria-label="Move to Trash"
        >
          Delete
        </Library.Item.Delete>
      </Tooltip.Root>
    </Library.Item>
  );
});

/**
 * Card body shared by every source. The media slot's dimensions are
 * decided by the active layout mode (`Library.Grid layout="…"`); we
 * just publish the cover's natural aspect ratio here as two inline
 * CSS custom properties so each layout can size the slot accordingly:
 *
 *   - `--card-aspect`     → the `aspect-ratio: w / h` token used
 *     by waterfall to pick a cell height from the column width.
 *   - `--card-aspect-num` → the same value as a unitless number
 *     used by justified's flex math to pick a cell width from the row
 *     height.
 *
 * Falls back to 1 / 1 when the cover dimensions are unknown (older
 * rows pre-Phase 4 ingest, or covers whose dims didn't survive the
 * scrape).
 */
const SaveCardBody = memo(function SaveCardBody({
  save,
  layout,
  selection,
}: {
  save: Save;
  layout?: CardLayout;
  selection?: CardSelection;
}) {
  const cover = save.files[save.coverIndex ?? 0];
  const w = cover?.width ?? save.width ?? null;
  const h = cover?.height ?? save.height ?? null;
  // Text-only tweets render <Card.Tweet> instead of media. Give them a
  // landscape default so the body has room to breathe without making
  // the waterfall column heights wildly inconsistent.
  const textTweet = isTextOnlyTweet(save);
  /* Clamp to a sane range so panoramas / extreme portraits don't
   * stretch a justified row into a single tile or shrink a waterfall
   * card to a sliver. */
  const ratio =
    w && h ? Math.min(2.5, Math.max(0.4, w / h)) : textTweet ? 4 / 3 : 1;
  const mediaStyle = useMemo<React.CSSProperties>(
    () =>
      ({
        "--card-aspect": w && h ? `${w} / ${h}` : textTweet ? "4 / 3" : "1 / 1",
        "--card-aspect-num": String(ratio),
      }) as React.CSSProperties,
    [w, h, ratio, textTweet],
  );
  const prefs = useDisplayPrefs();
  const showMeta = prefs.name || prefs.date;
  return (
    <>
      <Library.Item.Media style={mediaStyle}>
        <Card.Root save={save} layout={layout} selection={selection}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
        {prefs.fileCount && save.files.length > 1 ? (
          <Library.Item.Count aria-label={`${save.files.length} media files`}>
            {save.files.length}
          </Library.Item.Count>
        ) : null}
        {prefs.sourceBadge ? (
          <Library.Item.SourceBadge>
            <SourceBadge.Root source={save.source} data-size="sm" />
          </Library.Item.SourceBadge>
        ) : null}
      </Library.Item.Media>
      {showMeta ? (
        <Library.Item.Meta>
          {prefs.name ? (
            <Library.Item.Title>{save.title ?? save.url}</Library.Item.Title>
          ) : null}
          {prefs.date ? (
            <Library.Item.Time>
              {formatAbsolute(save.savedAt)}
            </Library.Item.Time>
          ) : null}
        </Library.Item.Meta>
      ) : null}
    </>
  );
});

/**
 * Absolute "YYYY/MM/DD HH:MM" timestamp used in the cards (Eagle-style)
 * and the list-mode Date Added column. Tabular numerals + zero-padded
 * fields keep the column tidy. Falls back to the raw ISO string when
 * the date is malformed.
 */
function formatAbsolute(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

// FNV-1a-ish hash of `id + seed`, used as a sort key for the /random
// view. Cheap and deterministic for a given seed, so the shuffle stays
// stable across re-renders while the user is on the page.
function hashShuffleKey(id: string, seed: string): number {
  const s = `${id}:${seed}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
