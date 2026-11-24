import { IconGrid, IconRefresh } from "@pond/icons";
import { viewAccountItems } from "@/features/library";
import { sourcesSelection } from "@/features/sources/state/sources-selection";
import { SelectionBar } from "@/shared/components/selection-bar";
import type { SourceTableRow } from "../lib/helpers";

function isRemote(row: SourceTableRow): boolean {
  return row.entry.kind !== "folder";
}

function canFetch(row: SourceTableRow): boolean {
  return isRemote(row) && row.model.connected && row.model.tone !== "run";
}

export function SourceSelectionBar() {
  const rows = sourcesSelection.useRows();
  const remote = rows.filter(isRemote);
  const fetchable = rows.filter(canFetch);
  return (
    <SelectionBar.Root
      label="Selected Sources"
      count={rows.length}
      onClear={() => sourcesSelection.clear()}
    >
      <SelectionBar.Action
        label="Show Saved Items"
        disabled={remote.length === 0}
        onClick={() => viewAccountItems(remote.map((row) => row.id))}
      >
        <IconGrid />
      </SelectionBar.Action>
      <SelectionBar.Action
        label="Fetch New Saves"
        disabled={fetchable.length === 0}
        onClick={() => {
          for (const row of fetchable) {
            void window.pond.syncRunNow(row.id);
          }
        }}
      >
        <IconRefresh />
      </SelectionBar.Action>
    </SelectionBar.Root>
  );
}
