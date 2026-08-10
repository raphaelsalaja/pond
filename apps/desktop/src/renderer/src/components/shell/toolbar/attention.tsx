import { IconTriangleWarningOutline18 as WarningIcon } from "@pond/icons/outline/18";
import { useMemo } from "react";
import {
  humanizeError,
  useSaveQueue,
} from "@/components/settings/funnel/lib/queue";
import type { AccountRow } from "@/hooks/use-accounts";
import type { WatchRow } from "@/hooks/use-watches";
import { relativeTimeFromMs } from "@/lib/util/relative-time";
import { useActivityEntries } from "@/stores/activity";
import type { SyncAccountStatus } from "@/stores/sync-monitor";
import {
  buildEntities,
  openFunnel,
  openSources,
  type Panel,
  type StatusEntity,
} from "./lib";
import { Empty, List, Row, StatusPanel } from "./panel";

interface ErrorsPanelProps {
  open: boolean;
  onOpenChange: (next: Panel | null) => void;
  accounts: AccountRow[];
  watches: WatchRow[];
  byAccount: Record<string, SyncAccountStatus>;
}

export function ErrorsPanel({
  open,
  onOpenChange,
  accounts,
  watches,
  byAccount,
}: ErrorsPanelProps) {
  const entities = useMemo(
    () => buildEntities(accounts, watches, byAccount),
    [accounts, watches, byAccount],
  );
  const alerts = entities.filter((e) => e.tone === "warn");
  const syncErrors = entities.filter((e) => e.tone === "err");
  const { failed } = useSaveQueue();
  const activity = useActivityEntries();
  const activityErrors = activity
    .filter((e) => e.state === "error")
    .slice(0, 5);
  const empty =
    alerts.length === 0 &&
    syncErrors.length === 0 &&
    failed.length === 0 &&
    activityErrors.length === 0;

  const close = () => onOpenChange(null);
  const goSources = () => {
    close();
    openSources();
  };
  const goFunnel = () => {
    close();
    openFunnel();
  };

  return (
    <StatusPanel
      open={open}
      onOpenChange={(next) => onOpenChange(next ? "errors" : null)}
      label="Last errors"
      icon={<WarningIcon />}
    >
      {empty ? (
        <Empty>No recent errors</Empty>
      ) : (
        <List>
          {alerts.map((entity) => (
            <EntityRow key={entity.id} entity={entity} onClick={goSources} />
          ))}
          {syncErrors.map((entity) => (
            <EntityRow key={entity.id} entity={entity} onClick={goSources} />
          ))}
          {failed.map((row) => (
            <Row
              key={row.save.id}
              title={row.name}
              subtitle={humanizeError(row.error)}
              meta="save"
              onClick={goFunnel}
            />
          ))}
          {activityErrors.map((entry) => (
            <Row
              key={entry.id}
              title={entry.label}
              subtitle={entry.message}
              meta={relativeTimeFromMs(entry.endedAt ?? entry.startedAt)}
              onClick={goFunnel}
            />
          ))}
        </List>
      )}
    </StatusPanel>
  );
}

function EntityRow({
  entity,
  onClick,
}: {
  entity: StatusEntity;
  onClick: () => void;
}) {
  return (
    <Row
      title={entity.title}
      subtitle={entity.model.meta}
      meta={entity.model.lastText}
      onClick={onClick}
    />
  );
}
