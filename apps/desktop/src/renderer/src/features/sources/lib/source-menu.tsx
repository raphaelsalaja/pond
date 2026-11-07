import {
  IconArchive,
  IconArrowRotateClockwise,
  IconArrowUpRight,
  IconCopy,
  IconCopyId,
  IconGrid,
  IconLink2,
  IconNotepad,
  IconSliders,
  IconTableDownload,
  IconTrash,
} from "@pond/icons";
import type { Source, WatchKind } from "@pond/schema/db";
import { watchHandleLabel } from "@pond/schema/watches";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import { viewAccountItems } from "@/features/library";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import type { WatchRow } from "@/features/sources/hooks/use-watches";
import { hasImportChoices } from "@/features/sources/lib/import-scope";
import { importMymindExport } from "@/features/sources/lib/mymind-export";
import { getSourceDef } from "@/features/sources/lib/registry";
import { sourceTargetUrl } from "@/features/sources/lib/source-target-url";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { mymindConnectFlow } from "@/features/sources/state/mymind-connect-flow";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

export interface SourceMenuTarget {
  id: string;
  type: "account" | "watch";
  source: Source;
  handle: string | null;
  label: string | null;
  watchKind?: WatchKind;
  model: CardModel;
  knownCount: number;
  lastError: string | null;
  importPending?: boolean;
}

export interface SourceMenuOptions {
  accounts?: readonly AccountRow[];
  onChanged?: () => void;
}

export function accountMenuTarget(
  account: AccountRow,
  model: CardModel,
): SourceMenuTarget {
  return {
    id: account.id,
    type: "account",
    source: account.source,
    handle: account.handle,
    label: account.label,
    model,
    knownCount: account.sync.knownCount,
    lastError: account.sync.lastError,
    importPending: account.sync.importPending,
  };
}

export function watchMenuTarget(
  watch: WatchRow,
  model: CardModel,
): SourceMenuTarget {
  return {
    id: watch.id,
    type: "watch",
    source: watch.source,
    handle: watch.handle,
    label: watch.label,
    watchKind: watch.kind,
    model,
    knownCount: watch.sync.knownCount,
    lastError: watch.sync.lastError,
  };
}

function targetKind(target: SourceMenuTarget): string {
  switch (target.watchKind) {
    case "feed":
      return "Feed";
    case "playlist":
      return "Playlist";
    case "list":
      return "List";
    case "board":
      return "Board";
    case "cluster":
      return "Cluster";
    case "channel":
      return "Channel";
    case "group":
      return "Group";
    default:
      return "Profile";
  }
}

function identityKind(target: SourceMenuTarget): string {
  switch (target.watchKind) {
    case "feed":
      return "Feed URL";
    case "playlist":
      return "Playlist ID";
    case "list":
      return "List ID";
    case "board":
      return "Board Path";
    case "cluster":
      return "Cluster Path";
    case "channel":
      return "Channel Handle";
    case "group":
      return "Group Handle";
    default:
      return "Username";
  }
}

function targetName(target: SourceMenuTarget): string {
  if (target.label) return target.label;
  if (target.handle) {
    return watchHandleLabel(target.handle, target.watchKind);
  }
  return getSourceDef(target.source).label;
}

async function copyText(
  text: string,
  id: string,
  successTitle: string,
): Promise<void> {
  const result = await window.pond.query("clipboard.writeText", { text });
  notify({
    id,
    title: result.ok ? successTitle : "Couldn't copy. Try again.",
  });
}

function profileItems(target: SourceMenuTarget): MenuItemSpec[] {
  const sourceLabel = getSourceDef(target.source).label;
  const kind = targetKind(target);
  const url = sourceTargetUrl({
    source: target.source,
    handle: target.handle,
    kind: target.watchKind,
  });
  return [
    {
      label: `Open ${sourceLabel} ${kind}`,
      icon: <IconArrowUpRight />,
      hidden: !url,
      onClick: url
        ? () => {
            void window.pond.openExternal(url).then((result) => {
              if (result.ok) return;
              notify({
                id: "source-open-profile",
                title: `Couldn't open ${sourceLabel}. Try again.`,
              });
            });
          }
        : undefined,
    },
    {
      label: "Show Saved Items",
      icon: <IconGrid />,
      onClick: () => viewAccountItems(target.id),
    },
  ];
}

function copyItems(target: SourceMenuTarget): MenuItemSpec[] {
  const kind = targetKind(target);
  const identity = identityKind(target);
  const url = sourceTargetUrl({
    source: target.source,
    handle: target.handle,
    kind: target.watchKind,
  });
  return [
    {
      label: `Copy ${kind} Link`,
      icon: <IconLink2 />,
      hidden: !url,
      onClick: url
        ? () => void copyText(url, "source-copy-link", `${kind} link copied`)
        : undefined,
    },
    {
      label: `Copy ${identity}`,
      icon: <IconCopy />,
      hidden: !target.handle,
      onClick: target.handle
        ? () =>
            void copyText(
              target.handle ?? "",
              "source-copy-identity",
              `${identity} copied`,
            )
        : undefined,
    },
    {
      label: "Copy Connection ID",
      icon: <IconCopyId />,
      onClick: () =>
        void copyText(
          target.id,
          "source-copy-connection-id",
          "Connection ID copied",
        ),
    },
  ];
}

function primaryFetchItem(target: SourceMenuTarget): MenuItemSpec {
  if (target.model.tone === "run") {
    return {
      label: "Cancel Fetch",
      icon: <IconArrowRotateClockwise />,
      onClick: () => void window.pond.syncCancel(target.id),
    };
  }
  return {
    label: target.model.tone === "err" ? "Retry Fetch" : "Fetch New Saves",
    icon: <IconArrowRotateClockwise />,
    disabled: !target.model.connected,
    onClick: () => void window.pond.syncRunNow(target.id),
  };
}

function importScopeItem(target: SourceMenuTarget): MenuItemSpec | null {
  if (target.type !== "account") return null;
  if (!target.importPending && !hasImportChoices(target.source)) return null;
  return {
    label: "Choose What to Import",
    icon: <IconSliders />,
    onClick: () => sourceDetail.openAccount(target.id, "filters"),
  };
}

function fetchItems(target: SourceMenuTarget): MenuItemSpec[] {
  const scopeItem = importScopeItem(target);
  const items: MenuItemSpec[] = target.importPending
    ? []
    : [primaryFetchItem(target)];
  if (scopeItem) items.push(scopeItem);
  if (target.type === "account" && target.source === "mymind") {
    items.push({
      label: "Import Older Saves",
      icon: <IconArchive />,
      onClick: () => void importMymindExport(),
    });
  } else if (target.type === "account") {
    items.push(
      {
        label: "Fetch Older Saves",
        icon: <IconArchive />,
        disabled:
          !target.model.connected ||
          target.model.tone === "run" ||
          target.importPending === true,
        onClick: () =>
          void window.pond.syncRunNow(target.id, { forceFull: true }),
      },
      {
        label: "Fetch Save Details",
        icon: <IconNotepad />,
        disabled: !target.model.connected,
        onClick: () =>
          void window.pond.refreshBackfillStart({ source: target.source }),
      },
      {
        label: "Fetch Original Media",
        icon: <IconTableDownload />,
        disabled: !target.model.connected,
        onClick: () => confirmOriginalMedia(target.source),
      },
    );
  }
  if (target.model.tone === "err" && target.lastError) {
    items.push({
      label: "Copy Last Fetch Error",
      icon: <IconCopy />,
      onClick: () =>
        void copyText(
          target.lastError ?? "",
          "source-copy-fetch-error",
          "Fetch error copied",
        ),
    });
  }
  return items;
}

function confirmOriginalMedia(source: Source): void {
  const sourceLabel = getSourceDef(source).label;
  Dialog.confirm({
    title: "Fetch Original Media",
    description: `Pond deletes the media on every ${sourceLabel} save and downloads it again. Each save shows no media until its download finishes.`,
    confirmLabel: "Fetch",
    onConfirm: async () => {
      await window.pond.refreshBackfillStart({ source, overwrite: true });
    },
  });
}

function startSourceSignIn(
  source: Source,
  accounts: readonly AccountRow[],
  accountId?: string,
): void {
  if (source === "mymind") {
    mymindConnectFlow.start(accountId);
    return;
  }
  connectFlow.start(
    source,
    accounts
      .filter((account) => account.connected)
      .map((account) => account.id),
  );
  sourceFlow.open("connect-wait");
}

function confirmRemove(target: SourceMenuTarget, onChanged: () => void): void {
  const count = target.knownCount;
  const itemCount = formatPlural(count, { one: "item", other: "items" });
  if (target.type === "watch") {
    Dialog.confirm({
      title: "Stop Watching",
      description: `Pond stops checking ${targetName(target)} for new posts. The ${itemCount} already saved stay in your library.`,
      confirmLabel: "Stop",
      onConfirm: async () => {
        await window.pond.query("watches.remove", { watchId: target.id });
        onChanged();
        sourceDetail.close();
      },
    });
    return;
  }

  Dialog.confirm({
    title: "Disconnect",
    description: `Pond signs ${targetName(target)} out and stops its syncing. The ${itemCount} already saved stay in your library.`,
    confirmLabel: "Disconnect",
    onConfirm: async () => {
      await window.pond.query("accounts.disconnect", { accountId: target.id });
      onChanged();
      sourceDetail.close();
    },
  });
}

function connectionItems(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): MenuItemSpec[] {
  const sourceLabel = getSourceDef(target.source).label;
  const items: MenuItemSpec[] = [];
  if (target.type === "account") {
    items.push({
      label: target.source === "mymind" ? "Reconnect" : "Sign In Again",
      icon: <IconLink2 />,
      onClick: () =>
        startSourceSignIn(target.source, options.accounts ?? [], target.id),
    });
  }
  items.push({
    label:
      target.type === "account" ? `Disconnect ${sourceLabel}` : "Stop Watching",
    icon: <IconTrash />,
    variant: "destructive",
    onClick: () =>
      confirmRemove(target, options.onChanged ?? sourceDetail.changed),
  });
  return items;
}

function singleSourceMenu(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): MenuItemSpec[] {
  return [
    { type: "group", items: profileItems(target) },
    { type: "separator" },
    { type: "group", items: copyItems(target) },
    { type: "separator" },
    { type: "group", items: fetchItems(target) },
    { type: "separator" },
    {
      type: "group",
      items: connectionItems(target, options),
    },
  ];
}

export interface SourceActionButton {
  label: string;
  /** Names the action for assistive tech when the label alone is ambiguous. */
  name?: string;
  variant?: "secondary" | "destructive";
  onClick: () => void;
}

export interface SourceActionRow {
  id: string;
  title: string;
  description?: string;
  value?: string;
  disabled?: boolean;
  actions: SourceActionButton[];
  /** An on/off setting, shown as a switch after any actions. */
  toggle?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
}

export interface SourceActionSections {
  /** Titles the profile section by what the target is: Profile, Playlist, Board. */
  kind: string;
  profile: SourceActionRow[];
  fetch: SourceActionRow[];
  connection: SourceActionRow[];
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function profileRows(target: SourceMenuTarget): SourceActionRow[] {
  const sourceLabel = getSourceDef(target.source).label;
  const kind = targetKind(target);
  const identity = identityKind(target);
  const url = sourceTargetUrl({
    source: target.source,
    handle: target.handle,
    kind: target.watchKind,
  });
  const rows: SourceActionRow[] = [];
  if (url) {
    rows.push({
      id: "link",
      title: `${sourceLabel} ${kind}`,
      value: displayUrl(url),
      actions: [
        {
          label: "Copy",
          name: `Copy ${kind} Link`,
          onClick: () =>
            void copyText(url, "source-copy-link", `${kind} link copied`),
        },
        {
          label: "Open",
          name: `Open ${sourceLabel} ${kind}`,
          onClick: () => {
            void window.pond.openExternal(url).then((result) => {
              if (result.ok) return;
              notify({
                id: "source-open-profile",
                title: `Couldn't open ${sourceLabel}. Try again.`,
              });
            });
          },
        },
      ],
    });
  }
  if (target.handle) {
    const handle = target.handle;
    rows.push({
      id: "identity",
      title: identity,
      value: handle,
      actions: [
        {
          label: "Copy",
          name: `Copy ${identity}`,
          onClick: () =>
            void copyText(handle, "source-copy-identity", `${identity} copied`),
        },
      ],
    });
  }
  rows.push(
    {
      id: "connection-id",
      title: "Connection ID",
      value: target.id,
      actions: [
        {
          label: "Copy",
          name: "Copy Connection ID",
          onClick: () =>
            void copyText(
              target.id,
              "source-copy-connection-id",
              "Connection ID copied",
            ),
        },
      ],
    },
    {
      id: "saved",
      title: "Saved Items",
      value: formatNumber(target.knownCount),
      actions: [
        {
          label: "Show",
          name: "Show Saved Items",
          onClick: () => viewAccountItems(target.id),
        },
      ],
    },
  );
  return rows;
}

function fetchRows(target: SourceMenuTarget): SourceActionRow[] {
  const sourceLabel = getSourceDef(target.source).label;
  const { connected, tone } = target.model;
  const pending = target.importPending === true;
  const rows: SourceActionRow[] = [];
  if (tone === "err" && target.lastError) {
    const error = target.lastError;
    rows.push({
      id: "error",
      title: "Last Fetch Error",
      description: error,
      actions: [
        {
          label: "Copy",
          name: "Copy Last Fetch Error",
          onClick: () =>
            void copyText(
              error,
              "source-copy-fetch-error",
              "Fetch error copied",
            ),
        },
      ],
    });
  }
  rows.push({
    id: "new",
    title: "Fetch New Saves",
    description:
      tone === "run"
        ? "A fetch is running now."
        : `Checks ${sourceLabel} for posts saved since the last fetch.`,
    disabled: pending || (tone !== "run" && !connected),
    actions: [
      tone === "run"
        ? {
            label: "Cancel",
            name: "Cancel Fetch",
            onClick: () => void window.pond.syncCancel(target.id),
          }
        : {
            label: tone === "err" ? "Retry" : "Fetch",
            name: tone === "err" ? "Retry Fetch" : "Fetch New Saves",
            onClick: () => void window.pond.syncRunNow(target.id),
          },
    ],
  });
  if (target.type !== "account") return rows;
  if (target.source === "mymind") {
    rows.push({
      id: "older",
      title: "Import Older Saves",
      description:
        "Use your mymind export to import items saved before you connected.",
      actions: [
        {
          label: "Import Export",
          onClick: () => void importMymindExport(),
        },
      ],
    });
    return rows;
  }
  rows.push(
    {
      id: "older",
      title: "Fetch Older Saves",
      description: "Walks your whole history instead of stopping early.",
      disabled: pending || !connected || tone === "run",
      actions: [
        {
          label: "Fetch",
          name: "Fetch Older Saves",
          onClick: () =>
            void window.pond.syncRunNow(target.id, { forceFull: true }),
        },
      ],
    },
    {
      id: "details",
      title: "Fetch Save Details",
      description: `Reads text, authors, and dates again for every ${sourceLabel} save.`,
      disabled: pending || !connected,
      actions: [
        {
          label: "Fetch",
          name: "Fetch Save Details",
          onClick: () =>
            void window.pond.refreshBackfillStart({ source: target.source }),
        },
      ],
    },
    {
      id: "media",
      title: "Fetch Original Media",
      description: `Replaces the media on every ${sourceLabel} save with a fresh download.`,
      disabled: pending || !connected,
      actions: [
        {
          label: "Fetch",
          name: "Fetch Original Media",
          onClick: () => confirmOriginalMedia(target.source),
        },
      ],
    },
  );
  return rows;
}

function connectionRows(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): SourceActionRow[] {
  const sourceLabel = getSourceDef(target.source).label;
  const remove = () =>
    confirmRemove(target, options.onChanged ?? sourceDetail.changed);
  if (target.type !== "account") {
    return [
      {
        id: "remove",
        title: "Stop Watching",
        description: "Saves already in your library stay.",
        actions: [{ label: "Stop", variant: "destructive", onClick: remove }],
      },
    ];
  }
  return [
    {
      id: "sign-in",
      title: target.source === "mymind" ? "Reconnect" : "Sign In Again",
      description:
        target.source === "mymind"
          ? "Replace the access key. Your import start date stays the same."
          : `Use this when ${sourceLabel} signs you out.`,
      actions: [
        {
          label: target.source === "mymind" ? "Reconnect" : "Sign In",
          onClick: () =>
            startSourceSignIn(target.source, options.accounts ?? [], target.id),
        },
      ],
    },
    {
      id: "remove",
      title: `Disconnect ${sourceLabel}`,
      description: "Saves already in your library stay.",
      actions: [
        { label: "Disconnect", variant: "destructive", onClick: remove },
      ],
    },
  ];
}

/** The single-target menu as Settings rows, for the details dialog. */
export function buildSourceActionRows(
  target: SourceMenuTarget,
  options: SourceMenuOptions = {},
): SourceActionSections {
  return {
    kind: targetKind(target),
    profile: profileRows(target),
    fetch: fetchRows(target),
    connection: connectionRows(target, options),
  };
}

function batchSourceMenu(targets: readonly SourceMenuTarget[]): MenuItemSpec[] {
  const fetchable = targets.filter(
    (target) => target.model.connected && target.model.tone !== "run",
  );
  return [
    {
      type: "group",
      items: [
        {
          label: "Show Saved Items",
          icon: <IconGrid />,
          onClick: () => viewAccountItems(targets.map((target) => target.id)),
        },
      ],
    },
    { type: "separator" },
    {
      type: "group",
      items: [
        {
          label: "Fetch New Saves",
          icon: <IconArrowRotateClockwise />,
          disabled: fetchable.length === 0,
          onClick: () => {
            for (const target of fetchable) {
              void window.pond.syncRunNow(target.id);
            }
          },
        },
      ],
    },
  ];
}

export function buildSourceActionMenu(
  targetOrTargets: SourceMenuTarget | readonly SourceMenuTarget[],
  options: SourceMenuOptions = {},
): MenuItemSpec[] {
  const targets = Array.isArray(targetOrTargets)
    ? targetOrTargets
    : [targetOrTargets];
  const target = targets[0];
  if (!target) return [];
  return targets.length === 1
    ? singleSourceMenu(target, options)
    : batchSourceMenu(targets);
}
