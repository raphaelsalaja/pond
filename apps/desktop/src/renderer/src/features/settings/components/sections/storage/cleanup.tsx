import { Button, Settings } from "@pond/ui";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { reviewDuplicates, trashWithUndo } from "@/features/saves";
import { formatBytes, formatPlural } from "@/shared/lib/format";
import { FilterSelect } from "./filter-select";
import { refreshStorage, STORAGE_INSIGHTS_KEY } from "./lib/queries";
import { ListEmpty } from "./list-empty";
import { SaveList, useSaveSelection } from "./save-list";

const LIMIT = 100;

const MIB = 1024 * 1024;

const FIRST_THRESHOLD = 100 * MIB;

const THRESHOLDS = [FIRST_THRESHOLD, 500 * MIB, 1024 * MIB].map((bytes) => ({
  value: String(bytes),
  label: `Over ${formatBytes(bytes)}`,
}));

function ExactDuplicates() {
  const query = useQuery({
    queryKey: [...STORAGE_INSIGHTS_KEY, "duplicates"],
    queryFn: () => window.pond.query("storage.duplicates", {}),
  });
  const data = query.data;
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Exact Duplicates</Settings.ItemTitle>
        <Settings.ItemDescription>
          {data
            ? data.groups
              ? `${formatPlural(data.saves, { one: "Save", other: "Saves" })} in ${formatPlural(data.groups, { one: "group", other: "groups" })} · About ${formatBytes(data.extraBytes)} in extra copies`
              : "No Saves share identical files."
            : query.isError
              ? "Couldn't check for duplicates."
              : "Checking for duplicates"}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          disabled={!data?.groups}
          onClick={() => reviewDuplicates(data?.ids ?? [])}
        >
          Review Duplicates
        </Button>
      </Settings.ItemControl>
    </Settings.Item>
  );
}

function LargeSaves() {
  const client = useQueryClient();
  const [threshold, setThreshold] = useState(String(FIRST_THRESHOLD));
  const [moving, startMoving] = useTransition();
  const minBytes = Number(threshold);
  const query = useQuery({
    queryKey: [...STORAGE_INSIGHTS_KEY, "cleanup", minBytes],
    queryFn: () =>
      window.pond.query("storage.largestSaves", { limit: LIMIT, minBytes }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.saves ?? [];
  const selection = useSaveSelection(rows);

  function moveToTrash() {
    const ids = selection.chosen.map((row) => row.id);
    startMoving(async () => {
      await trashWithUndo(ids, () => void refreshStorage(client));
      selection.clear();
      await refreshStorage(client);
    });
  }

  return (
    <>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Large Saves</Settings.ItemTitle>
          <Settings.ItemDescription>
            Moved Saves free their space once you empty the Trash.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <FilterSelect
            label="Minimum Size"
            value={threshold}
            onChange={setThreshold}
            options={THRESHOLDS}
          />
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item>
        <SaveList.Selection rows={rows} selection={selection}>
          <Button
            size="sm"
            variant="secondary"
            loading={moving}
            disabled={!selection.chosen.length}
            onClick={moveToTrash}
          >
            Move to Trash
          </Button>
        </SaveList.Selection>
      </Settings.Item>
      <Settings.Item>
        {rows.length ? (
          <SaveList.Items
            aria-label="Large Saves"
            rows={rows}
            selection={selection}
          />
        ) : (
          <ListEmpty
            query={query}
            noun="Saves"
            emptyTitle={`No Saves Over ${formatBytes(minBytes)}`}
          />
        )}
      </Settings.Item>
    </>
  );
}

export function StorageCleanup() {
  return (
    <Settings.List>
      <ExactDuplicates />
      <LargeSaves />
    </Settings.List>
  );
}
