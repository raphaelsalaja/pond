import { ContentRow, Input, Settings } from "@pond/ui";
import type { StorageOrder } from "@shared/storage-insights";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { openSave } from "@/features/saves";
import { formatBytes } from "@/shared/lib/format";
import { FilterSelect } from "../filter-select";
import { labelForExtension, labelForKind } from "../lib/labels";
import { ORDER_OPTIONS } from "../lib/order";
import { STORAGE_INSIGHTS_KEY } from "../lib/queries";
import { ListEmpty } from "../list-empty";
import styles from "./styles.module.css";

const LIMIT = 50;

const ALL = "all";

export function LargestFiles() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState(ALL);
  const [extension, setExtension] = useState(ALL);
  const [order, setOrder] = useState<StorageOrder>("largest");
  const term = search.trim();
  const query = useQuery({
    queryKey: [
      ...STORAGE_INSIGHTS_KEY,
      "largest-files",
      term,
      kind,
      extension,
      order,
    ],
    queryFn: () =>
      window.pond.query("storage.largestFiles", {
        limit: LIMIT,
        search: term || undefined,
        kind: kind === ALL ? undefined : kind,
        extension: extension === ALL ? undefined : extension,
        order,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const files = data?.files ?? [];
  const filtered = term !== "" || kind !== ALL || extension !== ALL;

  function clearFilters() {
    setSearch("");
    setKind(ALL);
    setExtension(ALL);
  }

  return (
    <Settings.List>
      <Settings.Item>
        <div className={styles.filters}>
          <Input.Root size="sm" className={styles.search}>
            <Input.Field
              aria-label="Search Largest Files"
              placeholder="Search…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </Input.Root>
          <FilterSelect
            label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: ALL, label: "All Kinds" },
              ...(data?.kinds ?? []).map((entry) => ({
                value: entry,
                label: labelForKind(entry),
              })),
            ]}
          />
          <FilterSelect
            label="Extension"
            value={extension}
            onChange={setExtension}
            options={[
              { value: ALL, label: "All Extensions" },
              ...(data?.extensions ?? []).map((entry) => ({
                value: entry,
                label: labelForExtension(entry),
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
        {files.length ? (
          <ol className={styles.files} aria-label="Largest Files">
            {files.map((file, index) => (
              <li key={`${file.saveId}:${file.name}:${index}`}>
                <ContentRow.Root>
                  <ContentRow.Trigger onClick={() => openSave(file.saveId)}>
                    <ContentRow.Content>
                      <ContentRow.Title>
                        {file.name || "Untitled File"}
                      </ContentRow.Title>
                      <ContentRow.Description>
                        {[
                          labelForKind(file.kind),
                          file.extension
                            ? labelForExtension(file.extension)
                            : null,
                          file.saveTitle || file.saveUrl,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ContentRow.Description>
                    </ContentRow.Content>
                    <span className={styles.size}>
                      {formatBytes(file.size)}
                    </span>
                  </ContentRow.Trigger>
                </ContentRow.Root>
              </li>
            ))}
          </ol>
        ) : (
          <ListEmpty
            query={query}
            noun="Files"
            filter={filtered ? { term, clear: clearFilters } : undefined}
            emptyTitle="No Files with Sizes"
          />
        )}
      </Settings.Item>
    </Settings.List>
  );
}
