import { useDataTable } from "@pond/ui/data-table";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useAccounts } from "@/features/sources/hooks/use-accounts";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { buildFolderMenu } from "./lib/folder-menu";
import type { SourceTableRow } from "./lib/helpers";
import { buildSourceMenu, contextMenuSources } from "./lib/menu";

interface SourcesContextMenuProps {
  row: SourceTableRow;
  children: ReactElement;
}

export function SourcesContextMenu({ row, children }: SourcesContextMenuProps) {
  const { selectionStore, actions } = useDataTable<SourceTableRow>();
  const { accounts } = useAccounts();
  const client = useQueryClient();
  return (
    <SpecContextMenu
      onOpen={() => {
        if (selectionStore.state.selectedIds.has(row.id)) return;
        actions.replaceSelection([row.id]);
      }}
      buildItems={() =>
        row.entry.kind === "folder"
          ? buildFolderMenu(
              {
                name: row.name,
                imported: row.items,
                watching: row.entry.row.enabled,
                mode: row.entry.row.mode,
              },
              () =>
                void client.invalidateQueries({ queryKey: ["watched-folder"] }),
            )
          : buildSourceMenu(contextMenuSources(row), {
              accounts,
              onChanged: sourceDetail.changed,
            })
      }
    >
      {children}
    </SpecContextMenu>
  );
}
