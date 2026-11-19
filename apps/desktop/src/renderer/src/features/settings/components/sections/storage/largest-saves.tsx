import type { MediaType } from "@pond/schema/db";
import { SOURCES, sourceLabel } from "@pond/schema/source-ids";
import { Input, Settings } from "@pond/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { openSave } from "@/features/saves";
import { formatBytes } from "@/shared/lib/format";
import styles from "./styles.module.css";

const LIMIT = 50;

function labelForSource(source: string): string {
  const known = SOURCES.find((entry) => entry === source);
  return known ? sourceLabel(known) : source;
}

function labelForType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function LargestSaves() {
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [source, setSource] = useState("");
  const query = useQuery({
    queryKey: ["storage-largest-saves", search, mediaType, source],
    queryFn: () =>
      window.pond.query("storage.largestSaves", {
        limit: LIMIT,
        search: search.trim() || undefined,
        mediaType: mediaType || undefined,
        source: source || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows = data?.saves ?? [];
  return (
    <Settings.List>
      <Settings.Item>
        <div className={styles.filters}>
          <Input.Root size="sm" className={styles.search}>
            <Input.Field
              aria-label="Search Saves"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </Input.Root>
          <select
            className={styles.select}
            aria-label="Media type"
            value={mediaType}
            onChange={(event) => {
              const next = data?.mediaTypes.find(
                (type) => type === event.currentTarget.value,
              );
              setMediaType(next ?? "");
            }}
          >
            <option value="">All Types</option>
            {data?.mediaTypes.map((type) => (
              <option key={type} value={type}>
                {labelForType(type)}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Source"
            value={source}
            onChange={(event) => setSource(event.currentTarget.value)}
          >
            <option value="">All Sources</option>
            {data?.sources.map((entry) => (
              <option key={entry} value={entry}>
                {labelForSource(entry)}
              </option>
            ))}
          </select>
        </div>
      </Settings.Item>
      {rows.length ? (
        <Settings.Item>
          <ol className={styles.saves} aria-label="Largest Saves">
            {rows.map((row) => (
              <li key={row.id} className={styles.save}>
                <button
                  type="button"
                  className={styles.open}
                  onClick={() => openSave(row.id)}
                >
                  <span className={styles.title}>{row.title || row.url}</span>
                  <span className={styles.meta}>
                    {[
                      row.mediaType ? labelForType(row.mediaType) : null,
                      labelForSource(row.source),
                      `${row.fileCount} ${row.fileCount === 1 ? "file" : "files"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span className={styles.size}>{formatBytes(row.fileSize)}</span>
              </li>
            ))}
          </ol>
        </Settings.Item>
      ) : (
        <Settings.Item>
          <Settings.ItemDescription>
            {query.isError
              ? "Couldn't load Saves."
              : query.isPending
                ? "Loading"
                : "No Saves with recorded file sizes match."}
          </Settings.ItemDescription>
        </Settings.Item>
      )}
    </Settings.List>
  );
}
