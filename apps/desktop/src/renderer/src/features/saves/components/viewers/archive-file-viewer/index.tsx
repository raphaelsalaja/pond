import { Input } from "@pond/ui";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { errorCopy } from "@/shared/lib/error-copy";
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
  const [entries, setEntries] = useState<Array<ArchiveEntry> | null>(null);
  const [query, setQuery] = useState("");
  const [inspectError, setInspectError] = useState<string | null>(null);
  const readable = /\.(zip|lottie|livp)$/i.test(path);
  const sourceSafety = archiveSafety({
    entries: 0,
    compressed: size,
    uncompressed: 0,
  });
  const error =
    readable && !sourceSafety.safe
      ? `Preview blocked: ${sourceSafety.reason}.`
      : inspectError;
  const sourceSafe = sourceSafety.safe;

  useEffect(() => {
    if (!readable) {
      onUnavailable();
      return;
    }
    if (!sourceSafe) {
      return;
    }

    let alive = true;
    const fail = (reason: string) => {
      if (alive) {
        setInspectError(`This archive could not be inspected: ${reason}`);
      }
    };
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
        if (!bounds.safe) {
          fail(bounds.reason ?? "unsafe archive");
          return;
        }
        if (alive) {
          setEntries(next.slice(0, 2000));
        }
      })
      .catch((cause: unknown) => {
        fail(errorCopy(cause, "unknown error"));
      });
    return () => {
      alive = false;
    };
  }, [onUnavailable, readable, size, sourceSafe, url]);

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
