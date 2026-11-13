import { IconCircleCheck, IconFile, IconLink2 } from "@pond/icons";
import { DataTable } from "@pond/ui/data-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SourcesEmpty } from "@/features/sources/components/empty";
import { NewSourceMenu } from "@/features/sources/components/new-menu";
import { cardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import { useAccounts } from "@/features/sources/hooks/use-accounts";
import { useWatchedFolder } from "@/features/sources/hooks/use-watched-folder";
import { useWatches } from "@/features/sources/hooks/use-watches";
import {
  sourceDetail,
  useSourceDetailRevision,
} from "@/features/sources/state/source-detail";
import {
  SOURCE_COLUMN_CATALOG,
  SOURCES_DEFAULT_SORT,
  sourcesColumnsLayout,
  useSourcesColumnLayout,
} from "@/features/sources/state/sources-columns";
import {
  sourcesFilters,
  useSourcesFilters,
} from "@/features/sources/state/sources-filters";
import { sourcesSelection } from "@/features/sources/state/sources-selection";
import { useSyncByAccount } from "@/features/sources/state/sync-monitor";
import { useWatchAdded, watchFlow } from "@/features/sources/state/watch-flow";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { SearchChrome } from "@/shared/components/search-chrome";
import {
  TableFilterBar,
  TableFilterChip,
  TableFilterToggle,
} from "@/shared/components/table-filters";
import { uniqueFilterOptions } from "@/shared/components/table-filters/chip-label";
import { TableSelectionSync } from "@/shared/components/table-selection-sync";
import { useClientHeight } from "@/shared/hooks/use-client-height";
import { sourcesColumns } from "./columns";
import { SourcesContextMenu } from "./context-menu";
import {
  matchesSourceFilters,
  SOURCE_STATUS_OPTIONS,
  sourceFiltersActive,
} from "./lib/filters";
import {
  type SourceEntry,
  type SourceTableRow,
  toFolderTableRow,
  toSourceTableRow,
} from "./lib/helpers";
import { SourcesLoading } from "./loading";
import { SourceOptionsMenu } from "./options";
import { SourceSelectionBar } from "./selection-bar";
import styles from "./styles.module.css";

function openEntry(entry: SourceEntry): void {
  if (entry.kind === "account") sourceDetail.openAccount(entry.row.id);
  else if (entry.kind === "watch") sourceDetail.openWatch(entry.row.id);
  else sourceDetail.openFolder(entry.row.path);
}

function SourcesMatchesEmpty() {
  return <MatchesEmpty onReset={sourcesFilters.reset} />;
}

export function SourcesPage() {
  const { accounts, loading: accountsLoading, refetch } = useAccounts();
  const {
    watches,
    loading: watchesLoading,
    refetch: refetchWatches,
  } = useWatches();
  const watchedFolder = useWatchedFolder();
  const byAccount = useSyncByAccount();
  const addedWatchId = useWatchAdded();
  const detailRevision = useSourceDetailRevision();
  const filters = useSourcesFilters();
  const columnLayout = useSourcesColumnLayout();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { ref: tableRef, height: tableHeight } = useClientHeight();

  const tableRows = useMemo<SourceTableRow[]>(() => {
    const next: SourceTableRow[] = [];
    for (const row of accounts) {
      next.push(
        toSourceTableRow(
          { kind: "account", row },
          cardModel(byAccount[row.id]),
        ),
      );
    }
    for (const row of watches) {
      next.push(
        toSourceTableRow({ kind: "watch", row }, cardModel(byAccount[row.id])),
      );
    }
    const folder = watchedFolder.data
      ? toFolderTableRow(watchedFolder.data)
      : null;
    if (folder) next.push(folder);
    return next;
  }, [accounts, watches, watchedFolder.data, byAccount]);

  const rows = useMemo(
    () => tableRows.filter((row) => matchesSourceFilters(row, filters)),
    [tableRows, filters],
  );
  const columns = useMemo(
    () =>
      sourcesColumns.filter(
        (column) => !columnLayout.hidden.some((id) => id === column.id),
      ),
    [columnLayout.hidden],
  );
  const columnOrder = useMemo(
    () =>
      columnLayout.order.filter((id) =>
        columns.some((column) => column.id === id),
      ),
    [columns, columnLayout.order],
  );
  const sourceOptions = useMemo(
    () =>
      uniqueFilterOptions(
        tableRows.flatMap((row) =>
          row.source ? [{ id: row.source, label: row.sourceLabel }] : [],
        ),
      ),
    [tableRows],
  );
  const typeOptions = useMemo(
    () =>
      uniqueFilterOptions(
        tableRows.map((row) => ({ id: row.kindLabel, label: row.kindLabel })),
      ),
    [tableRows],
  );

  const rowsById = useMemo(() => {
    const next = new Map<string, SourceTableRow>();
    for (const row of rows) next.set(row.id, row);
    return next;
  }, [rows]);

  useEffect(() => {
    if (!addedWatchId) return;
    void refetchWatches();
    sourceDetail.openWatch(addedWatchId);
    watchFlow.consumeAdded();
  }, [addedWatchId, refetchWatches]);

  useEffect(() => {
    if (detailRevision === 0) return;
    void refetch();
    void refetchWatches();
  }, [detailRevision, refetch, refetchWatches]);

  const loaded =
    !accountsLoading && !watchesLoading && !watchedFolder.isPending;
  const showMatchesEmpty = loaded && tableRows.length > 0 && rows.length === 0;

  const onRowClick = useCallback((row: SourceTableRow) => {
    openEntry(row.entry);
  }, []);
  const toolbar = (
    <SearchChrome.Root
      actions={
        <>
          <NewSourceMenu controlled />
          <SourceOptionsMenu />
          <TableFilterToggle
            open={filtersOpen}
            active={sourceFiltersActive(filters)}
            controlsId="sources-filter-toolbar"
            onToggle={() => setFiltersOpen((open) => !open)}
          />
        </>
      }
      below={
        <TableFilterBar
          open={filtersOpen}
          id="sources-filter-toolbar"
          label="Source Filters"
        >
          <TableFilterChip
            name="Status"
            icon={<IconCircleCheck />}
            options={SOURCE_STATUS_OPTIONS}
            selected={filters.statuses}
            onChange={sourcesFilters.setStatuses}
          />
          <TableFilterChip
            name="Source"
            icon={<IconLink2 />}
            options={sourceOptions}
            selected={filters.sources}
            onChange={sourcesFilters.setSources}
          />
          <TableFilterChip
            name="Type"
            icon={<IconFile />}
            options={typeOptions}
            selected={filters.types}
            onChange={sourcesFilters.setTypes}
          />
        </TableFilterBar>
      }
    >
      <SearchChrome.Input
        value={filters.q}
        onChange={(e) => sourcesFilters.setQ(e.target.value)}
        spellCheck={false}
        placeholder="Search sources…"
        aria-label="Search Sources"
        data-sources-search=""
      />
    </SearchChrome.Root>
  );

  return (
    <DataTable.Provider
      data={rows}
      columns={columns}
      columnOrder={columnOrder}
      onColumnOrderChange={(order) =>
        sourcesColumnsLayout.applyVisibleOrder(order)
      }
      sorting={columnLayout.sort}
      onSortingChange={(sort) => {
        const column = SOURCE_COLUMN_CATALOG.find(
          (item) => item.id === sort?.id,
        );
        sourcesColumnsLayout.setSort(
          sort && column
            ? { id: column.id, desc: sort.desc }
            : SOURCES_DEFAULT_SORT,
        );
      }}
      getRowId={(row) => row.id}
      onSelectionChange={(ids) => {
        sourcesSelection.set(
          ids
            .map((id) => rowsById.get(id))
            .filter((row): row is SourceTableRow => row != null),
        );
      }}
      height={
        showMatchesEmpty || tableHeight < 88 ? undefined : tableHeight - 40
      }
      selectOnClick
      onRowClick={onRowClick}
      renderRow={({ cells, rowProps, row }) => (
        <SourcesContextMenu row={row}>
          <div {...rowProps}>{cells}</div>
        </SourcesContextMenu>
      )}
    >
      {toolbar}
      <div className={styles.page}>
        <div className={styles.content}>
          {!loaded ? (
            <SourcesLoading />
          ) : tableRows.length === 0 ? (
            <SourcesEmpty />
          ) : showMatchesEmpty ? (
            <div className={styles.empty}>
              <SourcesMatchesEmpty />
            </div>
          ) : (
            <div ref={tableRef} className={styles.table}>
              <DataTable.Root className={styles.grid} aria-label="Sources">
                <DataTable.Empty>
                  <SourcesMatchesEmpty />
                </DataTable.Empty>
              </DataTable.Root>
            </div>
          )}
        </div>
        <SourceSelectionBar />
      </div>
      <DataTable.Hotkeys />
      <TableSelectionSync selection={sourcesSelection} rowsById={rowsById} />
    </DataTable.Provider>
  );
}
