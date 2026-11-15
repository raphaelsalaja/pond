import {
  IconCanvas,
  IconCheckboxChecked,
  IconDots,
  IconFileExport,
  IconFolders,
  IconStar,
  IconTagPlus,
  IconTrash,
  IconTrashXmark,
  IconUndo,
} from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import { openTagPicker } from "@/features/saves/lib/actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { buildSaveMenu } from "@/features/saves/lib/menu";
import { createSaveMenuContext } from "@/features/saves/lib/menu/context";
import { buildExportItems } from "@/features/saves/lib/menu/export";
import { buildCanvasItems } from "@/features/saves/lib/menu/organize";
import { glyph } from "@/features/saves/lib/menu/shared";
import {
  loadOpenWithApps,
  type OpenWithApp,
  openWithKind,
  peekOpenWithApps,
} from "@/features/saves/lib/open-with-menu";
import { rateSaves } from "@/features/saves/lib/rating";
import { clearSaveSelection } from "@/features/saves/lib/select";
import { selectResults } from "@/features/saves/lib/select-results";
import {
  deleteSelectionForever,
  restoreSelection,
  trashSelection,
} from "@/features/saves/lib/selection";
import { pool } from "@/features/saves/state/pool";
import {
  useSelectedIds,
  useSelectionActive,
} from "@/features/saves/state/selection";
import { tumbleToTrash } from "@/features/saves/state/trash-tumble";
import { useViewMode } from "@/features/saves/state/view-context";
import type { Save } from "@/features/saves/types";
import { tagClipboard } from "@/features/tags";
import { SelectionBar } from "@/shared/components/selection-bar";
import {
  RATING_COMMANDS,
  SHORTCUTS,
  shortcutGlyphs,
} from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";

function loadedSaves(ids: readonly string[]): Save[] {
  return ids.flatMap((id) => pool.get(id) ?? []);
}

function menuOptions(openWithApps: readonly OpenWithApp[] = []) {
  return {
    clipboardEmpty: tagClipboard.get().length === 0,
    openWithApps,
  };
}

function buildRatingItems(ids: readonly string[]): MenuItemSpec[] {
  const rate = (rating: number) => {
    void rateSaves(ids, rating).catch(() =>
      notify({
        id: "rating-error",
        title: "Couldn't update the rating",
        description: "Try again.",
      }),
    );
  };
  const [clear, ...stars] = RATING_COMMANDS;
  return [
    ...stars.map(
      (command): MenuItemSpec => ({
        label: SHORTCUTS[command.id].label,
        icon: glyph(IconStar),
        shortcut: shortcutGlyphs(command.id),
        onClick: () => rate(command.rating),
      }),
    ),
    { type: "separator" },
    {
      label: SHORTCUTS[clear.id].label,
      shortcut: shortcutGlyphs(clear.id),
      onClick: () => rate(clear.rating),
    },
  ];
}

function confirmDeleteForever(ids: readonly string[]): void {
  Dialog.confirm({
    title: "Delete Forever",
    description: `${ids.length === 1 ? "This save and its file are" : `${ids.length} saves and their files are`} deleted. This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => deleteSelectionForever(ids),
  });
}

/** Batch actions for the Library selection, shown once circles or a second Save make the selection deliberate. */
export function SaveSelectionBar() {
  const active = useSelectionActive();
  const ids = useSelectedIds();
  const inTrash = useViewMode() === "trash";
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);
  const count = active ? ids.length : 0;

  const exportItems = () => {
    const context = createSaveMenuContext(loadedSaves(ids), menuOptions());
    return context ? buildExportItems(context) : [];
  };
  const moreItems = () => {
    const saves = loadedSaves(ids);
    const first = saves[0];
    if (!first) return [];
    const peeked = peekOpenWithApps(openWithKind(first));
    return buildSaveMenu(
      saves,
      menuOptions(peeked.length ? peeked : openWithApps),
    );
  };
  const onMoreOpen = () => {
    const first = loadedSaves(ids)[0];
    if (!first) return;
    void loadOpenWithApps({
      ids: [...ids],
      kind: openWithKind(first),
      onApps: setOpenWithApps,
    });
  };

  return (
    <SelectionBar.Root
      label="Selected Saves"
      count={count}
      onClear={clearSaveSelection}
    >
      <SelectionBar.Action
        label="Select All"
        shortcut={shortcutGlyphs("grid.select-all")}
        onClick={() => void selectResults("all")}
      >
        <IconCheckboxChecked />
      </SelectionBar.Action>
      {inTrash ? null : (
        <>
          <SelectionBar.Action
            label="Add to Folders"
            shortcut={shortcutGlyphs("save.assign-folders")}
            onClick={() => saveLibraryBridge.openFolderPicker([...ids])}
          >
            <IconFolders />
          </SelectionBar.Action>
          <SelectionBar.Action
            label="Add Tags"
            shortcut={shortcutGlyphs("save.add-tag")}
            onClick={openTagPicker}
          >
            <IconTagPlus />
          </SelectionBar.Action>
          <SelectionBar.Menu
            label="Rate"
            buildItems={() => buildRatingItems(ids)}
          >
            <IconStar />
          </SelectionBar.Menu>
          <SelectionBar.Menu
            label="Add to Canvas"
            buildItems={() => buildCanvasItems([...ids])}
          >
            <IconCanvas />
          </SelectionBar.Menu>
        </>
      )}
      <SelectionBar.Menu label="Export" buildItems={exportItems}>
        <IconFileExport />
      </SelectionBar.Menu>
      {inTrash ? (
        <>
          <SelectionBar.Action
            label="Restore from Trash"
            shortcut={shortcutGlyphs("save.restore")}
            onClick={() => void restoreSelection(ids)}
          >
            <IconUndo />
          </SelectionBar.Action>
          <SelectionBar.Action
            label="Delete Forever"
            shortcut={shortcutGlyphs("save.delete-forever")}
            onClick={() => confirmDeleteForever(ids)}
          >
            <IconTrash />
          </SelectionBar.Action>
        </>
      ) : (
        <SelectionBar.Action
          label="Move to Trash"
          shortcut={shortcutGlyphs("save.trash")}
          onClick={() =>
            void tumbleToTrash([...ids]).then(() => trashSelection(ids))
          }
        >
          <IconTrashXmark />
        </SelectionBar.Action>
      )}
      <SelectionBar.Menu
        label="More Actions"
        search
        searchLabel="Search save operations"
        minWidth="280px"
        onOpen={onMoreOpen}
        buildItems={moreItems}
      >
        <IconDots />
      </SelectionBar.Menu>
    </SelectionBar.Root>
  );
}
