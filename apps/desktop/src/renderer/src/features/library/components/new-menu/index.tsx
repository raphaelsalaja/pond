import { IconPlus } from "@pond/icons";
import { Menu, Tooltip } from "@pond/ui";
import { useEffect, useState } from "react";
import {
  blankDocuments,
  useBlankDocuments,
} from "@/features/library/state/blank-documents";
import {
  newMenuDialog,
  useNewMenuDialog,
} from "@/features/library/state/new-menu-dialog";
import { filterMenuItems } from "@/shared/components/spec-context-menu/filter";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import { LibraryRepairDialog } from "../repair-dialog";
import { SaveDialog } from "./save-dialog";
import { buildNewMenuItems } from "./spec";
import styles from "./styles.module.css";

export function NewMenu() {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const [open, setOpen] = useState(false);
  const documents = useBlankDocuments();
  const items = filterMenuItems(
    buildNewMenuItems(documents.kinds, documents.icons),
    query,
  );

  useEffect(() => {
    if (open) void blankDocuments.refresh();
  }, [open]);

  return (
    <Menu.FilterProvider
      filter={null}
      autoHighlight
      value={query}
      onValueChange={onValueChange}
    >
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) reset();
        }}
      >
        <Tooltip label="New" side="bottom">
          <Menu.Trigger icon size="sm" variant="ghost" aria-label="New">
            <IconPlus />
          </Menu.Trigger>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner align="start" side="bottom">
            <Menu.Popup className={styles.popup}>
              <Menu.Input
                autoFocus
                aria-label="Search Actions"
                placeholder="Search…"
              />
              <Menu.FilterList>
                <Menu.Items items={items} />
              </Menu.FilterList>
              <Menu.Empty>No matches</Menu.Empty>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}

export function NewMenuDialogHost() {
  const dialog = useNewMenuDialog();
  const presentation = useRetainedDialogPayload(dialog);
  useEffect(() => {
    void blankDocuments.refresh();
  }, []);
  const kind = presentation.payload;
  if (kind?.kind === "links") {
    return (
      <SaveDialog
        open={presentation.open}
        onClose={() => newMenuDialog.close()}
      />
    );
  }
  if (kind?.kind === "repair") {
    return (
      <LibraryRepairDialog
        kind={kind.repair}
        saveIds={kind.saveIds}
        open={presentation.open}
        onClose={() => {
          kind.onClosed?.();
          newMenuDialog.close();
        }}
      />
    );
  }
  return null;
}
