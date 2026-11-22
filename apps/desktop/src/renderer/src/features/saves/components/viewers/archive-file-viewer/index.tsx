import { Input } from "@pond/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { formatBytes, formatPlural } from "@/shared/lib/format";
import { archiveSafety } from "./archive";
import styles from "./styles.module.css";

interface ArchiveFileViewerProps {
  url: string;
  path: string;
  size: number;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}

interface ArchiveEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

const ZipEntrySizes = z.object({
  _data: z
    .object({
      compressedSize: z.number().nonnegative().optional(),
      uncompressedSize: z.number().nonnegative().optional(),
    })
    .optional(),
});

export function ArchiveFileViewer({
  url,
  path,
  size,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: ArchiveFileViewerProps) {
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/\.(zip|lottie|livp)$/i.test(path)) {
      onUnavailable();
      return;
    }
    const sourceSafety = archiveSafety({
      entries: 0,
      compressed: size,
      uncompressed: 0,
    });
    if (!sourceSafety.safe) {
      setError(`Preview blocked: ${sourceSafety.reason}.`);
      return;
    }

    let alive = true;
    void Promise.all([
      fetch(url).then((response) => response.arrayBuffer()),
      import("jszip"),
    ])
      .then(async ([buffer, module]) => {
        const zip = await module.default.loadAsync(buffer);
        const files = Object.values(zip.files).filter((entry) => !entry.dir);
        const next = files.map((entry) => {
          const sized = ZipEntrySizes.parse(entry);
          return {
            name: entry.name,
            compressedSize: sized._data?.compressedSize ?? 0,
            uncompressedSize: sized._data?.uncompressedSize ?? 0,
          };
        });
        const bounds = archiveSafety({
          entries: next.length,
          compressed: size,
          uncompressed: next.reduce(
            (total, entry) => total + entry.uncompressedSize,
            0,
          ),
        });
        if (!bounds.safe) throw new Error(bounds.reason ?? "unsafe archive");
        if (alive) setEntries(next.slice(0, 2_000));
      })
      .catch((reason: Error) => {
        if (!alive) return;
        setError(
          `This archive could not be inspected: ${
            reason instanceof Error ? reason.message : "unknown error"
          }`,
        );
      });
    return () => {
      alive = false;
    };
  }, [onUnavailable, path, size, url]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!entries || !needle) return entries ?? [];
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, query]);

  return (
    <div className={styles.root}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Archive"
          start={
            <>
              {toolbarStart}
              <ViewerHud.Scale>
                {entries
                  ? formatPlural(entries.length, {
                      one: "file",
                      other: "files",
                    })
                  : "ZIP archive"}
              </ViewerHud.Scale>
            </>
          }
          center={
            <ViewerToolbarGroups
              controls={
                <Input.Root
                  size="sm"
                  variant="secondary"
                  className={styles.field}
                >
                  <Input.Field
                    type="search"
                    value={query}
                    placeholder="Search…"
                    aria-label="Filter archive files"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </Input.Root>
              }
              actions={toolbarActions}
            />
          }
        />
      </ChromePortal>
      {error ? <div className={styles.status}>{error}</div> : null}
      {!entries && !error ? (
        <div className={styles.status}>Reading archive directory</div>
      ) : null}
      {entries ? (
        <ul className={styles.list} data-scroll-fade="vertical">
          {filtered.map((entry) => (
            <li key={entry.name} className={styles.row}>
              <span>{entry.name}</span>
              <span>{formatBytes(entry.uncompressedSize)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
