import {
  IconArchive,
  IconArrowRotateClockwise,
  IconArrowUpRight,
  IconCopy,
  IconCopyId,
  IconDownload,
  IconGrid,
  IconLink2,
  IconNotepad,
  IconSliders,
  IconTableDownload,
  IconTrash,
} from "@pond/icons";
import type { ImportScope, Source, WatchKind } from "@pond/schema/db";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import { viewAccountItems } from "@/features/library";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import type { WatchRow } from "@/features/sources/hooks/use-watches";
import { hasImportChoices } from "@/features/sources/lib/import-scope";
import { getSourceDef } from "@/features/sources/lib/registry";
import { sourceTargetUrl } from "@/features/sources/lib/source-target-url";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { importScopeFlow } from "@/features/sources/state/import-scope-flow";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { formatNumber } from "@/shared/lib/format";
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
  syncLikes?: boolean;
  importScope?: ImportScope;
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
    syncLikes: account.sync.syncLikes,
    importScope: account.sync.importScope,
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
    return target.watchKind === "playlist" || target.watchKind === "list"
      ? target.handle
      : `@${target.handle}`;
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

function openImportScope(target: SourceMenuTarget): void {
  importScopeFlow.open({
    id: target.id,
    source: target.source,
    sync: {
      importScope: target.importScope,
      importPending: target.importPending,
      syncLikes: target.syncLikes,
    },
  });
  sourceFlow.open("import-scope");
}

function importScopeItem(target: SourceMenuTarget): MenuItemSpec | null {
  if (target.type !== "account") return null;
  if (target.importPending) {
    return {
      label: "Start Import",
      icon: <IconDownload />,
      onClick: () => openImportScope(target),
    };
  }
  if (!hasImportChoices(target.source)) return null;
  return {
    label: "Choose What to Import",
    icon: <IconSliders />,
    onClick: () => openImportScope(target),
  };
}

function fetchItems(target: SourceMenuTarget): MenuItemSpec[] {
  const scopeItem = importScopeItem(target);
  const items: MenuItemSpec[] = target.importPending
    ? []
    : [primaryFetchItem(target)];
  if (scopeItem) items.push(scopeItem);
  if (target.type === "account") {
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
        onClick: () =>
          void window.pond.refreshBackfillStart({
            source: target.source,
            overwrite: true,
          }),
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

function startSourceSignIn(
  source: Source,
  accounts: readonly AccountRow[],
): void {
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
  const itemCount = `${formatNumber(count)} item${count === 1 ? "" : "s"}`;
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
      label: "Sign In Again",
      icon: <IconLink2 />,
      onClick: () => startSourceSignIn(target.source, options.accounts ?? []),
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
