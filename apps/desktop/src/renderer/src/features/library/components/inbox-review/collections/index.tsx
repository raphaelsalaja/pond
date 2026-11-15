import type { Folder } from "@pond/schema/db";
import { Popover } from "@pond/ui";
import { type ReactElement, useMemo, useState } from "react";
import { recentFolderIds } from "@/features/library/lib/recent-folders";
import { REVIEW_FOLDER_SLOTS } from "@/features/library/lib/review-queue";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { FolderMenu, type FolderMenuItem } from "@/features/saves";
import { usePrefs } from "@/shared/state/prefs";

export type FolderChoice = Pick<Folder, "id" | "name">;

/** Recent folders are read once per Review, so the number keys never move while you file. */
export function useReviewFolders(): Folder[] {
  const folders = useFolders();
  const [recent] = useState(recentFolderIds);
  return useMemo(() => {
    const rank = new Map(recent.map((id, index) => [id, index]));
    const order = (folder: Folder) => rank.get(folder.id) ?? recent.length;
    const sorted = [...folders].sort((a, b) => order(a) - order(b));
    return sorted.slice(0, REVIEW_FOLDER_SLOTS);
  }, [folders, recent]);
}

interface ReviewFolderPickerProps {
  saveId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFile: (folder: FolderChoice) => void;
  trigger: ReactElement;
}

export function ReviewFolderPicker({
  saveId,
  open,
  onOpenChange,
  onFile,
  trigger,
}: ReviewFolderPickerProps) {
  const folders = useFolders();
  const memberships = useFolderMemberships();
  const [folderViews] = usePrefs("folderViews");
  const current = saveId ? (memberships[saveId] ?? []) : [];
  const items: FolderMenuItem[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    icon: folderViews[folder.id]?.icon,
    color: folder.color,
    count: current.includes(folder.id) ? 1 : 0,
  }));

  function file(folder: FolderChoice) {
    onOpenChange(false);
    onFile(folder);
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8}>
          <Popover.Popup aria-label="Choose Folder">
            <FolderMenu
              folders={items}
              selectionSize={1}
              selection="single"
              onToggle={(item) => file(item)}
              onCreate={async (name) => {
                const created = await window.pond.query("folders.create", {
                  name: name.trim(),
                });
                file({ id: created.id, name: name.trim() });
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
