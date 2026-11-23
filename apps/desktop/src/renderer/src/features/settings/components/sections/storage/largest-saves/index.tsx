import { MEDIA_TYPES } from "@pond/schema/db";
import { Button, Input, Settings } from "@pond/ui";
import type { StorageOrder } from "@shared/storage-insights";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { showInLibrary } from "@/features/saves";
import { FilterSelect } from "../filter-select";
import { labelForSource, labelForType } from "../lib/labels";
import { ORDER_OPTIONS } from "../lib/order";
import { STORAGE_INSIGHTS_KEY } from "../lib/queries";
import { ListEmpty } from "../list-empty";
import { SaveList, useSaveSelection } from "../save-list";
import styles from "./styles.module.css";

const LIMIT = 50;

const ALL = "all";

export function LargestSaves() {
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [order, setOrder] = useState<StorageOrder>("largest");
  const term = search.trim();
  const query = useQuery({
    queryKey: [
      ...STORAGE_INSIGHTS_KEY,
      "largest-saves",
      term,
      mediaType,
      source,
      order,
    ],
    queryFn: () =>
      window.pond.query("storage.largestSaves", {
        limit: LIMIT,
        search: term || undefined,
        mediaType: MEDIA_TYPES.find((type) => type === mediaType),
        source: source === ALL ? undefined : source,
        order,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows = data?.saves ?? [];
  const selection = useSaveSelection(rows);
  const filtered = term !== "" || mediaType !== ALL || source !== ALL;

  function clearFilters() {
    setSearch("");
    setMediaType(ALL);
    setSource(ALL);
  }

  return (
    <Settings.List>
      <Settings.Item>
        <div className={styles.filters}>
          <Input.Root size="sm" className={styles.search}>
            <Input.Field
              aria-label="Search Largest Saves"
              placeholder="Search…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </Input.Root>
          <FilterSelect
            label="Media Type"
            value={mediaType}
            onChange={setMediaType}
            options={[
              { value: ALL, label: "All Types" },
              ...(data?.mediaTypes ?? []).map((type) => ({
                value: type,
                label: labelForType(type),
              })),
            ]}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: ALL, label: "All Sources" },
              ...(data?.sources ?? []).map((entry) => ({
                value: entry,
                label: labelForSource(entry),
              })),
            ]}
          />
          <FilterSelect
            label="Order"
            value={order}
            onChange={setOrder}
            options={ORDER_OPTIONS}
          />
        </div>
      </Settings.Item>
      <Settings.Item>
        <SaveList.Selection rows={rows} selection={selection}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!selection.chosen.length}
            onClick={() => showInLibrary(selection.chosen.map((row) => row.id))}
          >
            Show in Library
          </Button>
        </SaveList.Selection>
      </Settings.Item>
      <Settings.Item>
        {rows.length ? (
          <SaveList.Items
            aria-label="Largest Saves"
            rows={rows}
            selection={selection}
          />
        ) : (
          <ListEmpty
            query={query}
            noun="Saves"
            filter={filtered ? { term, clear: clearFilters } : undefined}
            emptyTitle="No Saves with File Sizes"
          />
        )}
      </Settings.Item>
    </Settings.List>
  );
}
