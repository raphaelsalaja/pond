import { MEDIA_TYPES } from "@pond/schema/db";
import { SOURCES, sourceLabel } from "@pond/schema/source-ids";
import { Button, ContentRow, Empty, Input, Select, Settings } from "@pond/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { openSave } from "@/features/saves";
import { formatBytes } from "@/shared/lib/format";
import styles from "./styles.module.css";

const LIMIT = 50;

const ALL = "all";

export const LARGEST_SAVES_KEY = ["storage-largest-saves"] as const;

interface FilterOption {
  value: string;
  label: string;
}

function labelForSource(source: string): string {
  const known = SOURCES.find((entry) => entry === source);
  return known ? sourceLabel(known) : source;
}

function labelForType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) =>
        onChange(options.find((option) => option.value === next)?.value ?? ALL)
      }
    >
      <Select.Trigger size="sm" aria-label={label}>
        <Select.Value>
          {(current: string) =>
            options.find((option) => option.value === current)?.label ?? current
          }
        </Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6}>
          <Select.Popup>
            <Select.Items items={options} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function LargestSaves() {
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const query = useQuery({
    queryKey: [...LARGEST_SAVES_KEY, search, mediaType, source],
    queryFn: () =>
      window.pond.query("storage.largestSaves", {
        limit: LIMIT,
        search: search.trim() || undefined,
        mediaType: MEDIA_TYPES.find((type) => type === mediaType),
        source: source === ALL ? undefined : source,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows = data?.saves ?? [];
  const term = search.trim();
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
          <Filter
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
          <Filter
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
        </div>
      </Settings.Item>
      <Settings.Item>
        {rows.length ? (
          <ol className={styles.saves} aria-label="Largest Saves">
            {rows.map((row) => (
              <li key={row.id}>
                <ContentRow.Root>
                  <ContentRow.Trigger onClick={() => openSave(row.id)}>
                    <ContentRow.Content>
                      <ContentRow.Title>
                        {row.title || row.url}
                      </ContentRow.Title>
                      <ContentRow.Description>
                        {[
                          row.mediaType ? labelForType(row.mediaType) : null,
                          labelForSource(row.source),
                          `${row.fileCount} ${row.fileCount === 1 ? "file" : "files"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ContentRow.Description>
                    </ContentRow.Content>
                    <span className={styles.size}>
                      {formatBytes(row.fileSize)}
                    </span>
                  </ContentRow.Trigger>
                </ContentRow.Root>
              </li>
            ))}
          </ol>
        ) : query.isError ? (
          <Empty.Root role="alert">
            <Empty.Title>Couldn't Load Saves</Empty.Title>
            <Empty.Description>
              Check that the Library is available, then try again.
            </Empty.Description>
            <Empty.Action>
              <Button
                size="sm"
                variant="secondary"
                loading={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Try Again
              </Button>
            </Empty.Action>
          </Empty.Root>
        ) : query.isPending ? (
          <Empty.Root role="status">
            <Empty.Title>Loading Saves</Empty.Title>
          </Empty.Root>
        ) : filtered ? (
          <Empty.Root role="status">
            <Empty.Title>
              {term ? `No Results for “${term}”` : "No Matching Saves"}
            </Empty.Title>
            <Empty.Action>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </Empty.Action>
          </Empty.Root>
        ) : (
          <Empty.Root role="status">
            <Empty.Title>No Saves with File Sizes</Empty.Title>
          </Empty.Root>
        )}
      </Settings.Item>
    </Settings.List>
  );
}
