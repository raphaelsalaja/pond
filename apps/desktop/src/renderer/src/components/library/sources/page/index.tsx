import { Button, type MenuItemSpec } from "@pond/ui";
import { type CSSProperties, useEffect, useMemo } from "react";
import emptyStyles from "@/components/library/empty/styles.module.css";
import { LibraryGrid } from "@/components/library/layouts/grid";
import {
  LIBRARY_ITEM_GAP,
  PackedGrid,
  type PackedItem,
  packUniform,
} from "@/components/library/layouts/packed-grid";
import {
  type CardModel,
  cardModel,
} from "@/components/library/sources/sync-monitor/lib/helpers";
import { type AccountRow, useAccounts } from "@/hooks/use-accounts";
import { useGridMin } from "@/hooks/use-grid-min";
import { useWatches, type WatchRow } from "@/hooks/use-watches";
import { getSourceDef } from "@/lib/save/sources-registry";
import { getAppRouter } from "@/lib/ui/app-router";
import { clearAsk } from "@/stores/ask-store";
import {
  connectFlow,
  useConnectedBefore,
  useConnectWaiting,
} from "@/stores/connect-flow";
import { dockMode } from "@/stores/dock-mode";
import { useGridWidth } from "@/stores/shell-state";
import { sourceDetail, useSourceDetailRevision } from "@/stores/source-detail";
import { syncMonitor, useSyncByAccount } from "@/stores/sync-monitor";
import { setSearchInput } from "@/stores/view-store";
import { useWatchAdded, watchFlow } from "@/stores/watch-flow";
import { buildAccountMenu } from "./lib/account-menu";
import { syncFraction, tileValue, watchName } from "./lib/helpers";
import { SourceTile } from "./source-tile";
import styles from "./styles.module.css";

/** Avatar + name + meta chrome; columns follow library `--grid-min`, height stays tile-sized. */
const SOURCE_CELL_HEIGHT = 120;

type SourceEntry =
  | { kind: "account"; row: AccountRow }
  | { kind: "watch"; row: WatchRow };

function viewItemsFor(id: string): void {
  clearAsk();
  setSearchInput([{ field: "account", operator: "eq", value: id }], "");
  void getAppRouter()?.navigate({ to: "/" });
}

function buildAccountTileMenu(
  account: AccountRow,
  model: CardModel,
): MenuItemSpec[] {
  return [
    {
      label: "Sync Now",
      disabled: !(model.connected && model.tone !== "run"),
      onClick: () => void window.pond.syncRunNow(account.id),
    },
    {
      label: "View Items in Library",
      onClick: () => viewItemsFor(account.id),
    },
    { type: "separator" },
    ...buildAccountMenu(account, model),
  ];
}

function buildWatchTileMenu(watch: WatchRow, model: CardModel): MenuItemSpec[] {
  return [
    {
      label: "Check Now",
      disabled: model.tone === "run",
      onClick: () => void window.pond.syncRunNow(watch.id),
    },
    {
      label: "View Items in Library",
      onClick: () => viewItemsFor(watch.id),
    },
  ];
}

function cellStyle(item: PackedItem): CSSProperties {
  return {
    position: "absolute",
    top: `${item.top}px`,
    left: `${item.left}px`,
    width: `${item.width}px`,
    height: `${item.height}px`,
  };
}

export function SourcesPage() {
  const { accounts, loading: accountsLoading, refetch } = useAccounts();
  const {
    watches,
    loading: watchesLoading,
    refetch: refetchWatches,
  } = useWatches();
  const byAccount = useSyncByAccount();
  const width = useGridWidth();
  const colMin = useGridMin();
  /** Connect and watch flows live in the dock tray; this page polls for the outcome and opens the detail card. */
  const waiting = useConnectWaiting();
  const connectedBefore = useConnectedBefore();
  const addedWatchId = useWatchAdded();
  const detailRevision = useSourceDetailRevision();

  const entries = useMemo<SourceEntry[]>(() => {
    const next: SourceEntry[] = [];
    for (const row of accounts) next.push({ kind: "account", row });
    for (const row of watches) next.push({ kind: "watch", row });
    return next;
  }, [accounts, watches]);

  const byId = useMemo(() => {
    const map = new Map<string, SourceEntry>();
    for (const entry of entries) map.set(entry.row.id, entry);
    return map;
  }, [entries]);

  const { items, totalHeight } = useMemo(
    () =>
      packUniform(
        entries.map((e) => e.row.id),
        width,
        colMin,
        LIBRARY_ITEM_GAP,
        SOURCE_CELL_HEIGHT,
      ),
    [entries, width, colMin],
  );

  /** Poll the registry until the extension delivers the session, then kick that account's first sync. */
  useEffect(() => {
    if (!waiting) return;
    const source = waiting;
    let cancelled = false;
    let arrivedOnce = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const rows = await refetch();
          if (cancelled || arrivedOnce) return;
          const arrived = rows.find(
            (a) =>
              a.source === source && a.connected && !connectedBefore.has(a.id),
          );
          if (!arrived) return;
          arrivedOnce = true;
          syncMonitor.seed(arrived.id, source, { connected: true });
          void window.pond.syncRunNow(arrived.id);
          /** Let the wait card tick its remaining steps done before the detail card takes over. */
          connectFlow.complete();
          window.setTimeout(() => {
            /** Leaving connect-wait clears the flow via the dockMode subscription. */
            sourceDetail.openAccount(arrived.id);
          }, 1100);
        } catch {
          /* keep polling */
        }
      })();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, connectedBefore, refetch]);

  /** A watch added from the tray card lands here: refresh the grid and open its detail. */
  useEffect(() => {
    if (!addedWatchId) return;
    void refetchWatches();
    sourceDetail.openWatch(addedWatchId);
    watchFlow.consumeAdded();
  }, [addedWatchId, refetchWatches]);

  /** Edits made inside the tray's detail card refresh this page's list copies. */
  useEffect(() => {
    if (detailRevision === 0) return;
    void refetch();
    void refetchWatches();
  }, [detailRevision, refetch, refetchWatches]);

  /** Both lists begin as empty while their IPC queries are in flight. Wait for them
   * to settle before deciding that this is the genuine first-run empty state. */
  if (!accountsLoading && !watchesLoading && entries.length === 0) {
    return (
      <LibraryGrid.Root className={styles.root}>
        <div className={emptyStyles.welcome}>
          <div className={emptyStyles.copy}>
            <h2 className={emptyStyles.title}>No sources yet</h2>
            <p className={emptyStyles.text}>
              Connect a source or watch a public account. Pond keeps your
              library filling up in the background.
            </p>
          </div>
          <div className={emptyStyles.actions}>
            <Button
              variant="accent"
              size="md"
              onClick={() => dockMode.open("source-new")}
            >
              Connect a source
            </Button>
          </div>
        </div>
      </LibraryGrid.Root>
    );
  }

  return (
    <LibraryGrid.Root className={styles.root}>
      <PackedGrid
        layout="grid"
        items={items}
        totalHeight={totalHeight}
        renderItem={(item) => {
          const entry = byId.get(item.id);
          if (!entry) return null;
          const status = byAccount[entry.row.id];
          const model = cardModel(status);
          if (entry.kind === "account") {
            const account = entry.row;
            return (
              <li key={item.id} className={styles.cell} style={cellStyle(item)}>
                <SourceTile
                  source={account.source}
                  avatarUrl={account.avatarUrl}
                  name={account.label ?? getSourceDef(account.source).label}
                  value={tileValue(
                    model.tone,
                    model.statusText,
                    account.sync?.knownCount ?? 0,
                  )}
                  tone={model.tone}
                  progress={syncFraction(model.tone, status)}
                  onOpen={() => sourceDetail.openAccount(account.id)}
                  menu={() => buildAccountTileMenu(account, model)}
                />
              </li>
            );
          }
          const watch = entry.row;
          return (
            <li key={item.id} className={styles.cell} style={cellStyle(item)}>
              <SourceTile
                source={watch.source}
                avatarUrl={watch.avatarUrl}
                name={watchName(watch)}
                value={tileValue(
                  model.tone,
                  model.statusText,
                  watch.sync?.knownCount ?? 0,
                )}
                tone={model.tone}
                progress={syncFraction(model.tone, status)}
                onOpen={() => sourceDetail.openWatch(watch.id)}
                menu={() => buildWatchTileMenu(watch, model)}
              />
            </li>
          );
        }}
      />
    </LibraryGrid.Root>
  );
}
