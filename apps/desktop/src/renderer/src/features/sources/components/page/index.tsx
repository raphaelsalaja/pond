import { IconCircleCheck, IconFile, IconLink2, IconRefresh } from "@pond/icons";
import { Button } from "@pond/ui";
import { DataTable } from "@pond/ui/data-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SourcesIntro } from "@/features/sources/components/intro";
import { NewSourceMenu } from "@/features/sources/components/new-menu";
import { useSourceTableRows } from "@/features/sources/hooks/use-source-table-rows";
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
import { formatPlural } from "@/shared/lib/format";
import { notify, updateNotification } from "@/shared/lib/toast";
import { sourcesColumns } from "./columns";
import { SourcesContextMenu } from "./context-menu";
import {
  matchesSourceFilters,
  SOURCE_STATUS_OPTIONS,
  sourceFiltersActive,
} from "./lib/filters";
import type { SourceFilters } from "./lib/filters";
import type { SourceEntry, SourceTableRow } from "./lib/helpers";
import { SourcesLoading } from "./loading";
import { SourceOptionsMenu } from "./options";
import { SourceSelectionBar } from "./selection-bar";
import styles from "./styles.module.css";

function openEntry(entry: SourceEntry): void {
  if (entry.kind === "account") sourceDetail.openAccount(entry.row.id);
  else if (entry.kind === "watch") sourceDetail.openWatch(entry.row.id);
  else sourceDetail.openFolder(entry.row.path);
}

function SourcesMatchesEmpty({
  filters,
  total,
}: {
  filters: SourceFilters;
  total: number;
}) {
  return (
    <MatchesEmpty
      query={filters.q}
      filtered={sourceFiltersActive(filters)}
      hidden={formatPlural(total, { one: "source", other: "sources" })}
      onReset={() => sourcesFilters.reset()}
    />
  );
}

export function SourcesPage() {
  const {
    rows: tableRows,
    loaded,
    refetchAccounts: refetch,
    refetchWatches,
  } = useSourceTableRows();
  const addedWatchId = useWatchAdded();
  const detailRevision = useSourceDetailRevision();
  const filters = useSourcesFilters();
  const columnLayout = useSourcesColumnLayout();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);
  const fetchingAllRef = useRef(false);
  const { ref: tableRef, height: tableHeight } = useClientHeight();

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

  const showMatchesEmpty = loaded && tableRows.length > 0 && rows.length === 0;

  const onRowClick = useCallback((row: SourceTableRow) => {
    openEntry(row.entry);
  }, []);
  const fetchAll = useCallback(async () => {
    if (fetchingAllRef.current) return;
    fetchingAllRef.current = true;
    setFetchingAll(true);
    const notificationId = notify({
      id: "sources-fetch-all",
      title: "Fetching sources",
      description: "Checking eligible sources for new saves.",
      timeout: 0,
    });
    try {
      const result = await window.pond.syncRunAll();
      if (!result.ok) {
        updateNotification({
          id: notificationId,
          title: "Sources are already fetching",
          description: "Check the source rows for progress.",
          timeout: 5000,
        });
        return;
      }
      updateNotification({
        id: notificationId,
        title: "Finished fetching sources",
        description: "Check a source row if it needs attention.",
        timeout: 5000,
      });
    } catch {
      updateNotification({
        id: notificationId,
        title: "Couldn't fetch sources",
        description: "Try again in a moment.",
        timeout: 8000,
      });
    } finally {
      fetchingAllRef.current = false;
      setFetchingAll(false);
    }
  }, []);
  if (loaded && tableRows.length === 0) return <SourcesIntro />;

  const toolbar = (
    <SearchChrome.Root
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon
            loading={fetchingAll}
            aria-label="Fetch All"
            onClick={() => void fetchAll()}
          >
            <IconRefresh />
          </Button>
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
            onChange={(next) => sourcesFilters.setStatuses(next)}
          />
          <TableFilterChip
            name="Source"
            icon={<IconLink2 />}
            options={sourceOptions}
            selected={filters.sources}
            onChange={(next) => sourcesFilters.setSources(next)}
          />
          <TableFilterChip
            name="Type"
            icon={<IconFile />}
            options={typeOptions}
            selected={filters.types}
            onChange={(next) => sourcesFilters.setTypes(next)}
          />
        </TableFilterBar>
      }
    >
      <SearchChrome.Field
        value={filters.q}
        onChange={(e) => sourcesFilters.setQ(e.target.value)}
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
      rowHeight={48}
      onSelectionChange={(ids) => {
        sourcesSelection.set(
          ids
            .map((id) => rowsById.get(id))
            .filter((row): row is SourceTableRow => row !== undefined),
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
          ) : showMatchesEmpty ? (
            <div className={styles.empty}>
              <SourcesMatchesEmpty filters={filters} total={tableRows.length} />
            </div>
          ) : (
            <div ref={tableRef} className={styles.table}>
              <DataTable.Root
                className={styles.grid}
                rows="inset"
                aria-label="Sources"
              >
                <DataTable.Empty>
                  <SourcesMatchesEmpty
                    filters={filters}
                    total={tableRows.length}
                  />
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
