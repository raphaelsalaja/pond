import {
  IconArrowRotateClockwise,
  IconArrowUpRight,
  IconBan,
  IconCircleXmarkFill,
  IconCopy,
  IconLink2,
  IconMediaPause,
  IconTrashXmark,
  IconWindowShare,
} from "@pond/icons";
import { type MenuItemSpec, useDataTable } from "@pond/ui";
import type { ReactElement } from "react";
import {
  canCancelDownload,
  cancelDownloadRows,
  canRetryDownload,
  canSkipDownload,
  canTrashDownload,
  retryDownloadRows,
  skipDownloadRows,
  trashDownloadRows,
} from "@/features/downloads/components/lib/actions";
import {
  type DownloadRow,
  statusFeed,
} from "@/features/downloads/lib/status-feed";
import { humanizeError } from "@/features/downloads/lib/status-feed/queue";
import { downloadsSelection } from "@/features/downloads/state/downloads-selection";
import { openSave } from "@/features/saves/navigation";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import type { DownloadViewRow } from "./columns";

export function openDownloadSave(row: DownloadRow): void {
  if (row.status === "complete") openSave(row.saveId);
}

function copyText(text: string): void {
  void window.pond.query("clipboard.writeText", { text });
}

const WEB_LINK = /^https?:\/\//i;

function openLink(url: string): void {
  void window.pond.openExternal(url).then((result) => {
    if (result.ok) return;
    statusFeed.error(
      "Open link",
      "Couldn't open the link. Copy it and paste it into your browser.",
    );
  });
}

function downloadErrorText(row: DownloadRow): string {
  const error = row.error?.trim();
  if (error) return error;
  return row.lastError?.trim() ? humanizeError(row.lastError) : "";
}

function menuTargets(row: DownloadRow): readonly DownloadRow[] {
  const selected = downloadsSelection.snapshot();
  return selected.some((item) => item.id === row.id) ? selected : [row];
}

export function buildDownloadMenuItems(
  rows: readonly DownloadRow[],
): MenuItemSpec[] {
  const plural = rows.length > 1;
  const single = plural ? undefined : rows[0];
  const url = single?.url.trim() ?? "";
  const error = single ? downloadErrorText(single) : "";
  const retryable = rows.some(canRetryDownload);
  const cancellable = rows.some(canCancelDownload);
  const skippable = rows.some(canSkipDownload);
  const trashable = rows.some(canTrashDownload);
  return [
    {
      label: "Open Save",
      icon: <IconWindowShare />,
      hidden: single?.status !== "complete",
      onClick: () => {
        if (single) openDownloadSave(single);
      },
    },
    { type: "separator" },
    {
      label: plural ? "Retry Selected" : "Retry Download",
      icon: <IconArrowRotateClockwise />,
      disabled: !retryable,
      onClick: () => void retryDownloadRows(rows),
    },
    {
      label: plural ? "Cancel Selected" : "Cancel Download",
      icon: <IconMediaPause />,
      disabled: !cancellable,
      onClick: () => void cancelDownloadRows(rows),
    },
    {
      label: plural ? "Skip Selected" : "Skip Download",
      icon: <IconBan />,
      disabled: !skippable,
      onClick: () => void skipDownloadRows(rows),
    },
    { type: "separator" },
    {
      label: "Open Link",
      icon: <IconArrowUpRight />,
      hidden: !WEB_LINK.test(url),
      onClick: () => openLink(url),
    },
    {
      label: "Copy Link",
      icon: <IconLink2 />,
      hidden: !url,
      onClick: () => copyText(url),
    },
    {
      label: "Copy Error",
      icon: <IconCopy />,
      hidden: !error,
      onClick: () => copyText(error),
    },
    { type: "separator" },
    {
      label: plural ? "Move Selected to Trash" : "Move to Trash",
      icon: <IconTrashXmark />,
      variant: "destructive",
      disabled: !trashable,
      onClick: () => void trashDownloadRows(rows),
    },
    { type: "separator" },
    {
      label: "Clear Selection",
      icon: <IconCircleXmarkFill />,
      onClick: downloadsSelection.clear,
    },
  ];
}

export function DownloadContextMenu({
  row,
  children,
}: {
  row: DownloadViewRow;
  children: ReactElement;
}) {
  const { actions, selectionStore } = useDataTable<DownloadViewRow>();
  return (
    <SpecContextMenu
      onOpen={() => {
        if (selectionStore.state.selectedIds.has(row.id)) return;
        actions.replaceSelection([row.id]);
        downloadsSelection.set([row]);
      }}
      buildItems={() => buildDownloadMenuItems(menuTargets(row))}
    >
      {children}
    </SpecContextMenu>
  );
}
