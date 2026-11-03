import {
  IconFolderOpen,
  IconFolderPen,
  IconFolderXmark,
  IconMediaPause,
  IconMediaPlay,
  IconTrash,
} from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import type { SourceActionSections } from "@/features/sources/lib/source-menu";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import { formatPlural } from "@/shared/lib/format";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { notify } from "@/shared/lib/toast";

interface FolderMenuTarget {
  name: string;
  imported: number;
  watching: boolean;
  mode: "copy" | "move";
}

async function revealFolder(name: string): Promise<void> {
  const result = await window.pond.query("autoImport.reveal", {});
  if (result.ok) return;
  notify({
    id: "folder-reveal",
    title: `Couldn't find ${name}. Change the folder to keep importing.`,
  });
}

async function setWatching(
  enabled: boolean,
  onChanged: () => void,
): Promise<void> {
  await window.pond.query("autoImport.set", { enabled });
  onChanged();
}

function setDeleteAfterImport(
  target: FolderMenuTarget,
  enabled: boolean,
  onChanged: () => void,
): void {
  const apply = async () => {
    await window.pond.query("autoImport.set", {
      mode: enabled ? "move" : "copy",
    });
    onChanged();
  };
  if (!enabled) {
    void apply();
    return;
  }
  Dialog.confirm({
    title: "Delete After Import",
    description: `Pond moves each file in ${target.name} to the Trash once it's in your library, including files it already imported.`,
    confirmLabel: "Turn On",
    confirmVariant: "destructive",
    onConfirm: apply,
  });
}

function confirmStop(target: FolderMenuTarget, onChanged: () => void): void {
  const count = target.imported;
  const fileCount = formatPlural(count, { one: "file", other: "files" });
  Dialog.confirm({
    title: "Stop Watching",
    description: `Pond stops importing new files from ${target.name}. The ${fileCount} already imported stay in your library.`,
    confirmLabel: "Stop",
    onConfirm: async () => {
      await window.pond.query("autoImport.set", { enabled: false, path: "" });
      onChanged();
    },
  });
}

/** The folder menu as Settings rows, for the details dialog. */
export function buildFolderRows(
  target: FolderMenuTarget & { path: string },
  onChanged: () => void,
): SourceActionSections {
  return {
    kind: "Folder",
    profile: [
      {
        id: "location",
        title: "Location",
        value: target.path,
        actions: [
          {
            label: REVEAL_LABEL,
            onClick: () => void revealFolder(target.name),
          },
          {
            label: "Change",
            name: "Change Folder",
            onClick: () => void pickWatchedFolder(),
          },
        ],
      },
      {
        id: "delete-after-import",
        title: "Delete After Import",
        description:
          target.mode === "move"
            ? "Pond moves each file to the Trash once it's in your library."
            : "Files stay in the folder after Pond imports them.",
        actions: [],
        toggle: {
          checked: target.mode === "move",
          onCheckedChange: (checked) =>
            setDeleteAfterImport(target, checked, onChanged),
        },
      },
    ],
    fetch: [],
    connection: [
      {
        id: "watching",
        title: target.watching ? "Pause Watching" : "Resume Watching",
        description: target.watching
          ? "Pond stops importing new files until you resume."
          : "Pond imports new files from the folder again.",
        actions: [
          {
            label: target.watching ? "Pause" : "Resume",
            name: target.watching ? "Pause Watching" : "Resume Watching",
            onClick: () => void setWatching(!target.watching, onChanged),
          },
        ],
      },
      {
        id: "remove",
        title: "Stop Watching",
        description: "Files already in your library stay.",
        actions: [
          {
            label: "Stop",
            variant: "destructive",
            onClick: () => confirmStop(target, onChanged),
          },
        ],
      },
    ],
  };
}

export function buildFolderMenu(
  target: FolderMenuTarget,
  onChanged: () => void,
): MenuItemSpec[] {
  return [
    {
      type: "group",
      items: [
        {
          label: REVEAL_LABEL,
          icon: <IconFolderOpen />,
          onClick: () => void revealFolder(target.name),
        },
        {
          label: "Change Folder",
          icon: <IconFolderPen />,
          onClick: () => void pickWatchedFolder(),
        },
      ],
    },
    { type: "separator" },
    {
      type: "group",
      items: [
        {
          label: target.watching ? "Pause Watching" : "Resume Watching",
          icon: target.watching ? <IconMediaPause /> : <IconMediaPlay />,
          onClick: () => void setWatching(!target.watching, onChanged),
        },
        {
          type: "checkbox",
          label: "Delete After Import",
          icon: <IconTrash />,
          checked: target.mode === "move",
          onCheckedChange: (checked) =>
            setDeleteAfterImport(target, checked, onChanged),
        },
        {
          label: "Stop Watching",
          icon: <IconFolderXmark />,
          variant: "destructive",
          onClick: () => confirmStop(target, onChanged),
        },
      ],
    },
  ];
}
