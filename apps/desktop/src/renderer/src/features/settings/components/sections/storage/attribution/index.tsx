import { ContentRow, Empty, Settings, Tabs } from "@pond/ui";
import type { StorageAttributionResult } from "@shared/storage-insights";
import { useQuery } from "@tanstack/react-query";
import { showFolderInLibrary, showMatchingInLibrary } from "@/features/saves";
import { getSourceDefForIdentity } from "@/features/sources";
import { formatBytes, formatPlural } from "@/shared/lib/format";
import { formatShare, labelForExtension, labelForType } from "../lib/labels";
import { STORAGE_INSIGHTS_KEY } from "../lib/queries";
import { ListEmpty } from "../list-empty";
import styles from "./styles.module.css";

interface Share {
  key: string;
  label: string;
  bytes: number;
  saves: number;
  open: () => void;
}

function labelForSourceIdentity(identity: string): string {
  const source = getSourceDefForIdentity(identity);
  if (source?.source === "local") return "Local Files";
  return source?.label ?? identity;
}

function shareRows(data: StorageAttributionResult) {
  return {
    type: data.types.map((row) => ({
      ...row,
      label: labelForType(row.key),
      open: () =>
        showMatchingInLibrary({
          field: "type",
          operator: "eq",
          value: row.key,
        }),
    })),
    source: data.sources.map((row) => ({
      ...row,
      label: labelForSourceIdentity(row.key),
      open: () =>
        showMatchingInLibrary({
          field: "source",
          operator: "eq",
          value: row.key,
        }),
    })),
    extension: data.extensions.map((row) => ({
      ...row,
      label: labelForExtension(row.key),
      open: () =>
        showMatchingInLibrary({
          field: "format",
          operator: "some",
          value: [row.key],
        }),
    })),
    folder: data.folders.map((row) => ({
      key: row.id,
      label: row.name,
      bytes: row.bytes,
      saves: row.saves,
      open: () => showFolderInLibrary(row.id),
    })),
  } satisfies Record<string, Array<Share>>;
}

function ShareList({
  label,
  rows,
  total,
  emptyTitle,
}: {
  label: string;
  rows: Array<Share>;
  total: number;
  emptyTitle: string;
}) {
  if (!rows.length) {
    return (
      <Empty.Root role="status">
        <Empty.Title>{emptyTitle}</Empty.Title>
      </Empty.Root>
    );
  }
  return (
    <ol className={styles.shares} aria-label={label}>
      {rows.map((row) => (
        <li key={row.key}>
          <ContentRow.Root>
            <ContentRow.Trigger onClick={row.open}>
              <ContentRow.Content>
                <ContentRow.Title>{row.label}</ContentRow.Title>
                <ContentRow.Description>
                  {`${formatPlural(row.saves, { one: "Save", other: "Saves" })} · ${formatShare(row.bytes, total)}`}
                </ContentRow.Description>
              </ContentRow.Content>
              <span className={styles.size}>{formatBytes(row.bytes)}</span>
            </ContentRow.Trigger>
          </ContentRow.Root>
        </li>
      ))}
    </ol>
  );
}

export function StorageAttribution() {
  const query = useQuery({
    queryKey: [...STORAGE_INSIGHTS_KEY, "attribution"],
    queryFn: () => window.pond.query("storage.attribution", {}),
  });
  const data = query.data;

  if (!data || data.totalBytes === 0) {
    return (
      <Settings.List>
        <Settings.Item>
          <ListEmpty
            query={query}
            noun="Storage"
            emptyTitle="No Saves with File Sizes"
          />
        </Settings.Item>
      </Settings.List>
    );
  }

  const rows = shareRows(data);
  const total = data.totalBytes;
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Save-Attributed Storage</Settings.ItemTitle>
          <Settings.ItemDescription>
            {`${formatBytes(total)} across ${formatPlural(data.saves, { one: "Save", other: "Saves" })}, not counting caches or the database.`}
            {data.unsizedFiles
              ? ` ${formatPlural(data.unsizedFiles, { one: "file has", other: "files have" })} no recorded size.`
              : null}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
      </Settings.Item>
      <Settings.Item>
        <Tabs.Root className={styles.tabs} defaultValue="type">
          <Tabs.List aria-label="Storage Views">
            <Tabs.Tab value="type">Media Type</Tabs.Tab>
            <Tabs.Tab value="source">Source</Tabs.Tab>
            <Tabs.Tab value="extension">Extension</Tabs.Tab>
            <Tabs.Tab value="folder">Folder</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="type">
            <ShareList
              label="Storage by Media Type"
              rows={rows.type}
              total={total}
              emptyTitle="No Media Types"
            />
          </Tabs.Panel>
          <Tabs.Panel value="source">
            <ShareList
              label="Storage by Source"
              rows={rows.source}
              total={total}
              emptyTitle="No Sources"
            />
          </Tabs.Panel>
          <Tabs.Panel value="extension">
            <ShareList
              label="Storage by Extension"
              rows={rows.extension}
              total={total}
              emptyTitle="No File Extensions"
            />
          </Tabs.Panel>
          <Tabs.Panel value="folder">
            <p className={styles.note}>
              A Save in more than one folder counts toward each. Subfolders
              count toward their top-level folder.
            </p>
            <ShareList
              label="Storage by Folder"
              rows={rows.folder}
              total={total}
              emptyTitle="No Saves in Folders"
            />
          </Tabs.Panel>
        </Tabs.Root>
      </Settings.Item>
    </Settings.List>
  );
}
