import { useMemo } from "react";
import { BatchRenameDialog } from "@/features/library/components/batch-rename";
import type { BatchRenameItem } from "@/features/library/components/batch-rename";
import { folders, useFolders } from "@/features/library/state/folders";
import {
  closeOrganizationRenameDialog,
  useOrganizationRenameDialog,
} from "@/features/library/state/organization-rename-dialog";
import type { OrganizationRenameKind } from "@/features/library/state/organization-rename-dialog";
import {
  savedViews,
  useSavedViews,
} from "@/features/library/state/saved-views";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

const TOKENS = [
  { token: "{n}", label: "Number" },
  { token: "{title}", label: "Name" },
  { token: "{date}", label: "Date" },
];

const NOUNS = {
  folders: { one: "Folder", other: "Folders" },
  "saved-views": { one: "Smart Folder", other: "Smart Folders" },
} satisfies Record<OrganizationRenameKind, { one: string; other: string }>;

function treeOrder<Row extends { id: string; parentId: string | null }>(
  rows: ReadonlyArray<Row>,
  selected: ReadonlySet<string>,
): Array<Row> {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, Array<Row>>();
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const ordered: Array<Row> = [];
  const visit = (parent: string | null) => {
    for (const row of children.get(parent) ?? []) {
      if (selected.has(row.id)) ordered.push(row);
      visit(row.id);
    }
  };
  visit(null);
  return ordered;
}

export function OrganizationRenameDialogHost() {
  const state = useOrganizationRenameDialog();
  const presentation = useRetainedDialogPayload(state);
  return presentation.payload ? (
    <OrganizationRenameDialog
      key={presentation.payload.id}
      open={presentation.open}
      kind={presentation.payload.kind}
      initialIds={presentation.payload.initialIds}
    />
  ) : null;
}

function OrganizationRenameDialog({
  open,
  kind,
  initialIds,
}: {
  open: boolean;
  kind: OrganizationRenameKind;
  initialIds?: Array<string>;
}) {
  const folderRows = useFolders();
  const viewRows = useSavedViews();
  const selected = useMemo(() => new Set(initialIds), [initialIds]);
  const items = useMemo(
    (): Array<BatchRenameItem> =>
      kind === "folders"
        ? treeOrder(folderRows, selected).map((row) => ({
            id: row.id,
            name: row.name,
            date: row.createdAt,
          }))
        : treeOrder(viewRows, selected).map((row) => ({
            id: row.id,
            name: row.name,
            date: row.createdAt,
          })),
    [folderRows, kind, selected, viewRows],
  );
  const noun = NOUNS[kind];

  return (
    <BatchRenameDialog
      open={open}
      noun={noun}
      items={items}
      tokens={TOKENS}
      defaultPattern="{n:2} {title}"
      onClose={closeOrganizationRenameDialog}
      onRename={async (request) => {
        const result =
          kind === "folders"
            ? await window.pond.query("folders.renameBatch", request)
            : await window.pond.query("savedViews.renameBatch", request);
        if (!result.ok) throw new Error(result.error ?? "Rename failed.");
        await (kind === "folders" ? folders.refresh() : savedViews.refresh());
        notify({
          id: "organization-rename",
          title: `${formatPlural(result.renamed, noun)} Renamed`,
        });
        closeOrganizationRenameDialog();
      }}
    />
  );
}
