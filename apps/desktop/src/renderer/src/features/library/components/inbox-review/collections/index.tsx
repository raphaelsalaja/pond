import { IconFolderPlus } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { Popover } from "@pond/ui";
import { useMemo, useState } from "react";
import { ReviewTarget } from "@/features/library/components/inbox-review/target";
import { readRecentFolderIds } from "@/features/library/lib/recent-folders";
import { REVIEW_FOLDER_SLOTS } from "@/features/library/lib/review-queue";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { FolderMenu, type FolderMenuItem } from "@/features/saves";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export const CHOOSE_FOLDER_TARGET = "choose-folder";

export type FolderChoice = Pick<Folder, "id" | "name">;

export function folderTarget(id: string): string {
  return `folder:${id}`;
}

/** Recent folders are read once per Review, so the number keys never move while you file. */
export function useReviewFolders(): Folder[] {
  const folders = useFolders();
  const [recent] = useState(readRecentFolderIds);
  return useMemo(() => {
    const rank = new Map(recent.map((id, index) => [id, index]));
    const order = (folder: Folder) => rank.get(folder.id) ?? recent.length;
    const sorted = [...folders].sort((a, b) => order(a) - order(b));
    return sorted.slice(0, REVIEW_FOLDER_SLOTS);
  }, [folders, recent]);
}

interface ReviewCollectionsProps {
  saveId: string;
  slots: readonly Folder[];
  over: string | null;
  choosing: boolean;
  onChoosingChange: (open: boolean) => void;
  onFile: (folder: FolderChoice) => void;
}

export function ReviewCollections({
  saveId,
  slots,
  over,
  choosing,
  onChoosingChange,
  onFile,
}: ReviewCollectionsProps) {
  const folders = useFolders();
  const memberships = useFolderMemberships();
  const [folderViews] = usePrefs("folderViews");
  const current = memberships[saveId] ?? [];
  const items: FolderMenuItem[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    icon: folderViews[folder.id]?.icon,
    color: folder.color,
    count: current.includes(folder.id) ? 1 : 0,
  }));

  function file(folder: FolderChoice) {
    onChoosingChange(false);
    onFile(folder);
  }

  return (
    <fieldset className={styles.collections} aria-label="Folders">
      {slots.map((folder, index) => (
        <ReviewTarget
          key={folder.id}
          target={folderTarget(folder.id)}
          over={over === folderTarget(folder.id)}
          layout="chip"
          icon={
            <FolderIcon
              name={folderViews[folder.id]?.icon}
              color={folder.color}
            />
          }
          label={folder.name}
          hint={String(index + 1)}
          aria-pressed={current.includes(folder.id)}
          onClick={() => file(folder)}
        />
      ))}
      <Popover.Root open={choosing} onOpenChange={onChoosingChange}>
        <ReviewTarget
          render={<Popover.Trigger />}
          target={CHOOSE_FOLDER_TARGET}
          over={over === CHOOSE_FOLDER_TARGET}
          layout="chip"
          icon={<IconFolderPlus />}
          label={slots.length > 0 ? "Other Folder" : "Choose Folder"}
          hint="F"
        />
        <Popover.Portal>
          <Popover.Positioner side="top">
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
    </fieldset>
  );
}
