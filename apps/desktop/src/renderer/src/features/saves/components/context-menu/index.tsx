import type { MenuItemSpec } from "@pond/ui";
import type { ReactElement } from "react";
import { createContext, useContext, useState } from "react";
import { useSave } from "@/features/saves/hooks/use-saves";
import {
  buildSaveMenu,
  contextMenuSaves,
  loadOpenWithApps,
  type OpenWithApp,
  openWithKind,
  peekOpenWithApps,
} from "@/features/saves/lib/menu";
import { selectOnlySave } from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { tagClipboard } from "@/features/tags";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";

const SAVE_MENU_WIDTH = "280px";
const SAVE_MENU_SEARCH_LABEL = "Search save operations";

const HostedContext = createContext(false);

function useSaveMenu() {
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);
  return {
    open(save: Save) {
      if (!selection.has(save.id)) selectOnlySave(save.id);
      const targets = contextMenuSaves(save);
      const kind = openWithKind(targets[0] ?? save);
      void loadOpenWithApps({
        ids: targets.map((item) => item.id),
        kind,
        onApps: setOpenWithApps,
      });
    },
    items(save: Save) {
      const targets = contextMenuSaves(save);
      const peeked = peekOpenWithApps(openWithKind(targets[0] ?? save));
      return buildSaveMenu(targets, {
        clipboardEmpty: tagClipboard.get().length === 0,
        openWithApps: peeked.length ? peeked : openWithApps,
      });
    },
  };
}

interface SaveContextMenuProps {
  save: Save;
  children: ReactElement;
}

export function SaveContextMenu({ save, children }: SaveContextMenuProps) {
  const menu = useSaveMenu();
  if (useContext(HostedContext)) return children;
  return (
    <SpecContextMenu
      search
      searchLabel={SAVE_MENU_SEARCH_LABEL}
      minWidth={SAVE_MENU_WIDTH}
      onOpen={() => menu.open(save)}
      buildItems={() => menu.items(save)}
    >
      {children}
    </SpecContextMenu>
  );
}

function cardSaveId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLElement>("[data-library-card][data-save-id]");
  return card?.dataset.saveId ?? null;
}

interface SaveCollectionContextMenuProps {
  buildBackgroundItems: () => MenuItemSpec[];
  acceptsBackground: (target: EventTarget | null) => boolean;
  children: ReactElement;
}

/** One menu root for a whole grid, so a grid render never pays for a closed menu per card. */
export function SaveCollectionContextMenu({
  buildBackgroundItems,
  acceptsBackground,
  children,
}: SaveCollectionContextMenuProps) {
  const menu = useSaveMenu();
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = useSave(targetId);
  return (
    <HostedContext.Provider value>
      <SpecContextMenu
        search
        searchLabel={target ? SAVE_MENU_SEARCH_LABEL : "Search operations"}
        minWidth={target ? SAVE_MENU_WIDTH : undefined}
        onOpen={(eventDetails) => {
          const element = eventDetails.event?.target ?? null;
          const id = cardSaveId(element);
          const save = id ? pool.get(id) : undefined;
          setTargetId(save ? save.id : null);
          if (save) menu.open(save);
          else if (!acceptsBackground(element)) eventDetails.cancel();
        }}
        buildItems={() =>
          target ? menu.items(target) : buildBackgroundItems()
        }
      >
        {children}
      </SpecContextMenu>
    </HostedContext.Provider>
  );
}
