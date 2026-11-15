import { IconFolderTree } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import type { MenuItemSpec } from "@pond/ui";
import { folders } from "@/features/library/state/folders";
import { notifyUndoableFolderChange } from "@/features/saves";
import { errorCopy } from "@/shared/lib/error-copy";
import { buildFolderTreeMenu } from "@/shared/lib/folder-tree-menu";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

function blockedIds(all: readonly Folder[], ids: readonly string[]) {
  const blocked = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of all)
      if (
        folder.parentId &&
        blocked.has(folder.parentId) &&
        !blocked.has(folder.id)
      ) {
        blocked.add(folder.id);
        grew = true;
      }
  }
  return blocked;
}

async function moveFolders(
  ids: readonly string[],
  parentId: string | null,
  destination: string,
  subject: string,
): Promise<void> {
  try {
    const result = await window.pond.query("folders.moveBatch", {
      ids: [...ids],
      parentId,
    });
    await folders.refresh();
    notifyUndoableFolderChange(
      "move-folders",
      `Moved ${subject} to ${destination}`,
      result.ok ? result.undoId : null,
      "Move undone",
    );
  } catch (error) {
    notify({
      id: "move-folders",
      title: "Couldn't move folders",
      description: errorCopy(error, "Try again."),
    });
  }
}

export function buildMoveFolderItems(ids: readonly string[]): MenuItemSpec[] {
  const all = folders.snapshot();
  const moving = all.filter((folder) => ids.includes(folder.id));
  const blocked = blockedIds(all, ids);
  const subject =
    moving.length === 1 && moving[0]
      ? `"${moving[0].name}"`
      : formatPlural(ids.length, { one: "folder", other: "folders" });
  const alreadyIn = (parentId: string | null) =>
    moving.every((folder) => (folder.parentId ?? null) === parentId);

  return [
    {
      label: "Top Level",
      icon: <IconFolderTree />,
      disabled: alreadyIn(null),
      onClick: () => void moveFolders(ids, null, "Top Level", subject),
    },
    { type: "separator" },
    ...buildFolderTreeMenu(all, (folder, icon) => ({
      label: folder.name,
      icon,
      disabled: blocked.has(folder.id) || alreadyIn(folder.id),
      onClick: () =>
        void moveFolders(ids, folder.id, `"${folder.name}"`, subject),
    })),
  ];
}
