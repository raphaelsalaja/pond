import {
  IconArrowUpRight,
  IconChatBubble,
  IconCopy,
  IconExternalLink,
  IconFolderOpen,
  IconFolderSend,
  IconTrashXmark,
} from "@pond/icons";
import { addSavesToChat } from "@/features/agent";
import { rememberFolderDestinations } from "@/features/library/lib/recent-folders";
import { folders } from "@/features/library/state/folders";
import {
  copyUrlsForSelection,
  openInBrowserForSelection,
  revealFilesForSelection,
} from "@/features/saves";
import { trashSaves } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";
import type { MenuEntry, MenuPage } from "./types";

function isWebUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function folderPage(saveIds: readonly string[]): MenuPage {
  return {
    kind: "folders",
    key: `folders:${saveIds.join(",")}`,
    title: "Add to Folder",
    saveIds,
  };
}

export async function addToFolder(
  saveIds: readonly string[],
  folderId: string,
): Promise<void> {
  try {
    await window.pond.query("folders.assign", {
      saveIds: [...saveIds],
      addIds: [folderId],
      removeIds: [],
    });
    rememberFolderDestinations([folderId]);
    await folders.refresh();
  } catch {
    notify({
      id: "command-menu-folder",
      title: "Couldn't add to the folder. Try again.",
    });
  }
}

async function copyLink(ids: readonly string[]): Promise<void> {
  const result = await copyUrlsForSelection(ids);
  notify({ id: "command-menu-copy-link", title: result.message });
}

export function saveActions(
  save: Save,
  onOpenSave: (id: string) => void,
): MenuEntry[] {
  const ids = [save.id];
  const actions: MenuEntry[] = [
    {
      id: "action:open",
      group: "",
      label: "Open Save",
      icon: <IconArrowUpRight aria-hidden />,
      keywords: "view show",
      run: () => onOpenSave(save.id),
    },
  ];
  if (save.files.length > 0) {
    actions.push({
      id: "action:reveal",
      group: "",
      label: "Reveal in Finder",
      icon: <IconFolderOpen aria-hidden />,
      keywords: "show file disk",
      run: () => void revealFilesForSelection(ids),
    });
  }
  if (isWebUrl(save.url)) {
    actions.push(
      {
        id: "action:open-in-browser",
        group: "",
        label: "Open in Browser",
        icon: <IconExternalLink aria-hidden />,
        keywords: "link website",
        run: () => void openInBrowserForSelection(ids),
      },
      {
        id: "action:copy-link",
        group: "",
        label: "Copy Link",
        icon: <IconCopy aria-hidden />,
        keywords: "url clipboard",
        run: () => void copyLink(ids),
      },
    );
  }
  actions.push(
    {
      id: "action:add-to-chat",
      group: "",
      label: "Add to Chat",
      icon: <IconChatBubble aria-hidden />,
      keywords: "assistant ask",
      run: () => addSavesToChat(ids),
    },
    {
      id: "action:add-to-folder",
      group: "",
      label: "Add to Folder",
      icon: <IconFolderSend aria-hidden />,
      keywords: "move organize collection",
      page: () => folderPage(ids),
    },
    {
      id: "action:trash",
      group: "",
      label: "Move to Trash",
      icon: <IconTrashXmark aria-hidden />,
      keywords: "delete remove",
      shortcut: "save.trash",
      run: () => void trashSaves(ids),
    },
  );
  return actions;
}
