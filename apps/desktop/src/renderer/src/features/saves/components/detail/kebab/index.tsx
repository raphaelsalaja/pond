import { IconDots as Ellipsis } from "@pond/icons";
import { Menu } from "@pond/ui";
import { useState } from "react";
import {
  buildSaveDetailMenu,
  loadOpenWithApps,
  type OpenWithApp,
  openWithKind,
  peekOpenWithApps,
} from "@/features/saves/lib/menu";
import type { Save } from "@/features/saves/types";
import { SpecMenu } from "@/shared/components/spec-context-menu";

export function KebabMenu({
  save,
  fileIndex = null,
}: {
  save: Save;
  fileIndex?: number | null;
}) {
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);

  return (
    <SpecMenu
      search
      searchLabel="Search save operations"
      minWidth="280px"
      buildItems={() => {
        const peeked = peekOpenWithApps(openWithKind(save, fileIndex));
        return buildSaveDetailMenu(save, {
          clipboardEmpty: true,
          fileIndex,
          openWithApps: peeked.length ? peeked : openWithApps,
          opened: true,
        });
      }}
      onOpen={() => {
        void loadOpenWithApps({
          ids: [save.id],
          fileIndex,
          kind: openWithKind(save, fileIndex),
          onApps: setOpenWithApps,
        });
      }}
    >
      <Menu.Trigger variant="ghost" size="sm" icon aria-label="Save Actions">
        <Ellipsis />
      </Menu.Trigger>
    </SpecMenu>
  );
}
