import {
  IconArrowDoorOutOutline18,
  IconCopyOutline18,
  IconFinderOutline18,
  IconLinkOutline18,
  IconOpenExternalOutline18,
  IconOpenInBrowserOutline18,
  IconRefreshClockwiseOutline18,
  IconTrashXmarkOutline18,
} from "@pond/icons/outline/18";
import type { Save as DbSave } from "@pond/schema/db";
import { ContextMenu, Menu, useToast } from "@pond/ui";
import { type ReactElement, useMemo } from "react";
import { optimistic } from "@/pool/bootstrap";
import { pool } from "@/pool/pool";
import type { Save } from "@/pool/types";

const ICON_SIZE = 14;

function Icon({
  component: Component,
}: {
  component: React.ComponentType<{ width: number; height: number }>;
}) {
  return <Component width={ICON_SIZE} height={ICON_SIZE} />;
}

type ActionDescriptor =
  | {
      type: "item";
      key: string;
      label: string;
      icon: React.ComponentType<{ width: number; height: number }>;
      disabled?: boolean;
      variant?: "danger";
      onSelect: () => void | Promise<void>;
    }
  | { type: "separator"; key: string };

// Mirrors macOS conventions; Windows / Linux get the right label without a
// per-call branch at each callsite.
const REVEAL_LABEL = (() => {
  if (typeof navigator === "undefined") return "Reveal in Finder";
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "Reveal in Finder";
  if (p.includes("win")) return "Show in Explorer";
  return "Show in File Manager";
})();

function useSaveActions(save: Save): ActionDescriptor[] {
  const toast = useToast();

  return useMemo<ActionDescriptor[]>(() => {
    const hasFiles = save.files.length > 0;
    const hasUrl = Boolean(save.url);
    const isTrashed = Boolean(save.deletedAt);
    const fileIndex = save.coverIndex ?? 0;

    const openFile = async () => {
      if (!hasFiles) return;
      await window.pond.openSaveFile(save.id, fileIndex);
    };

    const revealFile = async () => {
      if (!hasFiles) return;
      await window.pond.revealSave(save.id, fileIndex);
    };

    const copyUrl = async () => {
      if (!save.url) return;
      try {
        await navigator.clipboard.writeText(save.url);
        toast.add({ title: "URL copied", type: "success" });
      } catch {
        toast.add({ title: "Couldn't copy URL", type: "error" });
      }
    };

    const copyFilePath = async () => {
      const result = (await window.pond.query("saves.filePath", {
        id: save.id,
        fileIndex,
      })) as { ok: true; path: string } | { ok: false; reason: string };
      if (!result.ok) {
        toast.add({ title: "File not available", type: "error" });
        return;
      }
      try {
        await navigator.clipboard.writeText(result.path);
        toast.add({ title: "File path copied", type: "success" });
      } catch {
        toast.add({ title: "Couldn't copy file path", type: "error" });
      }
    };

    const trash = async () => {
      const prev = pool.get(save.id);
      if (!prev) return;
      await optimistic(
        () => {
          pool.upsert({ ...prev, deletedAt: Date.now() } as typeof prev);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({ kind: "trash", model: "save", id: save.id }),
      );
      toast.add({ title: "Moved to trash", type: "success" });
    };

    const untrash = async () => {
      const prev = pool.get(save.id);
      if (!prev) return;
      await optimistic(
        () => {
          pool.upsert({ ...prev, deletedAt: null } as typeof prev);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({ kind: "untrash", model: "save", id: save.id }),
      );
      toast.add({ title: "Restored", type: "success" });
    };

    const purge = async () => {
      const prev = pool.get(save.id);
      if (!prev) return;
      await optimistic(
        () => {
          pool.delete(save.id);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "purge",
            model: "save",
            id: save.id,
            before: save as unknown as DbSave,
          }),
      );
      toast.add({ title: "Deleted forever", type: "success" });
    };

    const refresh = async () => {
      if (!save.url) return;
      await window.pond.refreshSave(save.id);
    };

    const openInBrowser = async () => {
      if (!save.url) return;
      try {
        const parsed = new URL(save.url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          await window.pond.openExternal(parsed.toString());
        }
      } catch {
        /* malformed URL, drop silently */
      }
    };

    const items: ActionDescriptor[] = [
      {
        type: "item",
        key: "open",
        label: "Open with Default App",
        icon: IconOpenExternalOutline18,
        disabled: !hasFiles,
        onSelect: openFile,
      },
      {
        type: "item",
        key: "reveal",
        label: REVEAL_LABEL,
        icon: IconFinderOutline18,
        disabled: !hasFiles,
        onSelect: revealFile,
      },
      { type: "separator", key: "sep-1" },
      {
        type: "item",
        key: "copy-url",
        label: "Copy URL",
        icon: IconLinkOutline18,
        disabled: !hasUrl,
        onSelect: copyUrl,
      },
      {
        type: "item",
        key: "copy-path",
        label: "Copy File Path",
        icon: IconCopyOutline18,
        disabled: !hasFiles,
        onSelect: copyFilePath,
      },
      { type: "separator", key: "sep-2" },
      ...(isTrashed
        ? ([
            {
              type: "item",
              key: "untrash",
              label: "Restore from Trash",
              icon: IconArrowDoorOutOutline18,
              onSelect: untrash,
            },
            {
              type: "item",
              key: "purge",
              label: "Delete Forever",
              icon: IconTrashXmarkOutline18,
              variant: "danger",
              onSelect: purge,
            },
          ] satisfies ActionDescriptor[])
        : ([
            {
              type: "item",
              key: "trash",
              label: "Move to Trash",
              icon: IconTrashXmarkOutline18,
              variant: "danger",
              onSelect: trash,
            },
          ] satisfies ActionDescriptor[])),
      { type: "separator", key: "sep-3" },
      {
        type: "item",
        key: "refresh",
        label: "Refresh Metadata",
        icon: IconRefreshClockwiseOutline18,
        disabled: !hasUrl,
        onSelect: refresh,
      },
      {
        type: "item",
        key: "open-browser",
        label: "Open Original URL in Browser",
        icon: IconOpenInBrowserOutline18,
        disabled: !hasUrl,
        onSelect: openInBrowser,
      },
    ];

    return items;
  }, [save, toast]);
}

interface SaveContextMenuProps {
  save: Save;
  children: ReactElement;
}

export function SaveContextMenu({ save, children }: SaveContextMenuProps) {
  const actions = useSaveActions(save);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            {actions.map((action) => {
              if (action.type === "separator") {
                return <ContextMenu.Separator key={action.key} />;
              }
              return (
                <ContextMenu.Item
                  key={action.key}
                  disabled={action.disabled}
                  data-variant={action.variant}
                  onClick={() => void action.onSelect()}
                >
                  <ContextMenu.ItemIcon>
                    <Icon component={action.icon} />
                  </ContextMenu.ItemIcon>
                  <ContextMenu.ItemLabel>{action.label}</ContextMenu.ItemLabel>
                </ContextMenu.Item>
              );
            })}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface SaveActionsMenuProps {
  save: Save;
  children: ReactElement;
}

export function SaveActionsMenu({ save, children }: SaveActionsMenuProps) {
  const actions = useSaveActions(save);

  return (
    <Menu.Root>
      <Menu.Trigger render={children} />
      <Menu.Portal>
        <Menu.Positioner align="end" side="bottom" sideOffset={4}>
          <Menu.Popup>
            {actions.map((action) => {
              if (action.type === "separator") {
                return <Menu.Separator key={action.key} />;
              }
              return (
                <Menu.Item
                  key={action.key}
                  disabled={action.disabled}
                  data-variant={action.variant}
                  onClick={() => void action.onSelect()}
                >
                  <Menu.ItemIcon>
                    <Icon component={action.icon} />
                  </Menu.ItemIcon>
                  <Menu.ItemLabel>{action.label}</Menu.ItemLabel>
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
