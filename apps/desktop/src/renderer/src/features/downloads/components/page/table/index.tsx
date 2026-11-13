import {
  DataTable,
  type RenderRowArgs,
  useDataTable,
} from "@pond/ui/data-table";
import type { DownloadActivity } from "@shared/download-activity";
import type { QueueSourceGate } from "@shared/queue-contracts";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { DOWNLOAD_COLUMN_CATALOG } from "../../../lib/download-columns";
import { downloadActivityForSave } from "../../../lib/download-progress";
import type { DownloadRow } from "../../../lib/status-feed";
import {
  downloadsColumnsLayout,
  useDownloadsColumnLayout,
} from "../../../state/downloads-columns";
import { downloadsSelection } from "../../../state/downloads-selection";
import {
  DownloadQueueRow,
  type DownloadViewRow,
  downloadsColumns,
} from "../columns";
import { openDownloadSave } from "../context-menu";
import styles from "./styles.module.css";

/** TanStack Store tracks reads inside `subscribe` listeners, so syncing from one would re-run on every table change and revert it. */
function SelectionSync({ rowsById }: { rowsById: Map<string, DownloadRow> }) {
  const { actions, selectionStore } = useDataTable<DownloadViewRow>();
  const selectedRows = downloadsSelection.useRows();
  useEffect(() => {
    const ids = selectedRows
      .filter((row) => rowsById.has(row.id))
      .map((row) => row.id);
    const selected = selectionStore.state.selectedIds;
    if (ids.length !== selected.size || ids.some((id) => !selected.has(id))) {
      actions.replaceSelection(ids);
    }
  }, [actions, selectionStore, rowsById, selectedRows]);
  return null;
}

export function DownloadTable({
  rows,
  paused,
  activities,
  gates,
  height,
  extra,
}: {
  rows: DownloadRow[];
  paused: boolean;
  activities: readonly DownloadActivity[];
  gates: readonly QueueSourceGate[];
  height?: number;
  extra?: ReactNode;
}) {
  const viewRows = useMemo<DownloadViewRow[]>(() => {
    const gateBySource = new Map(gates.map((gate) => [gate.source, gate]));
    return rows.map((row) => ({
      ...row,
      paused,
      activity: downloadActivityForSave(activities, row.saveId),
      gate: gateBySource.get(row.source),
    }));
  }, [rows, paused, activities, gates]);
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );
  const renderRow = useCallback(
    (args: RenderRowArgs<DownloadViewRow>) => <DownloadQueueRow {...args} />,
    [],
  );
  const layout = useDownloadsColumnLayout();
  const columns = useMemo(
    () =>
      downloadsColumns.filter(
        (column) => !layout.hidden.some((id) => id === column.id),
      ),
    [layout.hidden],
  );
  const columnOrder = useMemo(
    () =>
      layout.order.filter((id) => columns.some((column) => column.id === id)),
    [columns, layout.order],
  );
  return (
    <DataTable.Provider
      data={viewRows}
      columns={columns}
      columnOrder={columnOrder}
      onColumnOrderChange={(order) =>
        downloadsColumnsLayout.applyVisibleOrder(order)
      }
      sorting={layout.sort}
      onSortingChange={(sort) => {
        const column = DOWNLOAD_COLUMN_CATALOG.find(
          (item) => item.id === sort?.id,
        );
        downloadsColumnsLayout.setSort(
          sort && column ? { id: column.id, desc: sort.desc } : null,
        );
      }}
      getRowId={(row) => row.id}
      height={height}
      selectionCheckboxes
      selectOnClick
      onRowClick={(row, event) => {
        if (event && event.detail < 2) return;
        const current = rowsById.get(row.id);
        if (current) openDownloadSave(current);
      }}
      renderRow={renderRow}
      onSelectionChange={(ids) => {
        const other = downloadsSelection
          .snapshot()
          .filter((row) => !rowsById.has(row.id));
        const selected = ids.flatMap((id) => {
          const row = rowsById.get(id);
          return row ? [row] : [];
        });
        downloadsSelection.set([...other, ...selected]);
      }}
    >
      <DataTable.Hotkeys />
      <DataTable.Root className={styles.grid} aria-label="Downloads">
        {extra ? <DataTable.ExtraRow>{extra}</DataTable.ExtraRow> : null}
      </DataTable.Root>
      <SelectionSync rowsById={rowsById} />
    </DataTable.Provider>
  );
}
