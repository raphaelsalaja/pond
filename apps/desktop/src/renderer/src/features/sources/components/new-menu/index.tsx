import { IconPlus } from "@pond/icons";
import { Menu } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { startConnect, startWatch } from "@/features/sources/lib/create";
import { buildSourceNewMenuItems } from "@/features/sources/lib/create-menu";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import {
  sourceNewMenu,
  useSourceNewMenuOpen,
} from "@/features/sources/state/source-new-menu";

export function NewSourcePopup({
  align = "end",
  onWatchedFolder,
}: {
  align?: "start" | "end";
  onWatchedFolder?: () => void;
} = {}) {
  const client = useQueryClient();

  function chooseWatchedFolder(): void {
    if (onWatchedFolder) {
      onWatchedFolder();
      return;
    }
    void pickWatchedFolder().then(() =>
      client.invalidateQueries({ queryKey: ["watched-folder"] }),
    );
  }

  return (
    <Menu.Portal>
      <Menu.Positioner align={align} side="bottom">
        <Menu.Popup>
          <Menu.Items
            items={buildSourceNewMenuItems({
              onConnect: (source) => void startConnect(source),
              onWatch: startWatch,
              onFolder: chooseWatchedFolder,
            })}
          />
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function NewSourceMenu({
  children: label = "New Source",
  controlled = false,
  onWatchedFolder,
}: {
  children?: string;
  controlled?: boolean;
  onWatchedFolder?: () => void;
} = {}) {
  const storedOpen = useSourceNewMenuOpen();

  return (
    <Menu.Root
      {...(controlled
        ? {
            open: storedOpen,
            onOpenChange: (next: boolean) => sourceNewMenu.setOpen(next),
          }
        : {})}
    >
      <Menu.Trigger
        variant="ghost"
        size="sm"
        icon
        aria-label={label}
        data-sources-new={controlled || undefined}
      >
        <IconPlus />
      </Menu.Trigger>
      <NewSourcePopup onWatchedFolder={onWatchedFolder} />
    </Menu.Root>
  );
}
