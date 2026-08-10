import { IconArrowRotateClockwiseOutline18 as SyncIcon } from "@pond/icons/outline/18";
import { useMemo } from "react";
import type { AccountRow } from "@/hooks/use-accounts";
import type { WatchRow } from "@/hooks/use-watches";
import type { SyncAccountStatus } from "@/stores/sync-monitor";
import {
  buildEntities,
  openSources,
  type Panel,
  type StatusEntity,
} from "./lib";
import { Empty, List, Row, StatusPanel } from "./panel";

interface OngoingPanelProps {
  open: boolean;
  onOpenChange: (next: Panel | null) => void;
  accounts: AccountRow[];
  watches: WatchRow[];
  byAccount: Record<string, SyncAccountStatus>;
}

export function OngoingPanel({
  open,
  onOpenChange,
  accounts,
  watches,
  byAccount,
}: OngoingPanelProps) {
  const entities = useMemo(
    () => buildEntities(accounts, watches, byAccount),
    [accounts, watches, byAccount],
  );
  const ongoing = entities.filter((e) => e.tone === "run");
  const close = () => onOpenChange(null);
  const goSources = () => {
    close();
    openSources();
  };

  return (
    <StatusPanel
      open={open}
      onOpenChange={(next) => onOpenChange(next ? "ongoing" : null)}
      label="Ongoing"
      icon={<SyncIcon />}
    >
      {ongoing.length === 0 ? (
        <Empty>No active syncs</Empty>
      ) : (
        <List>
          {ongoing.map((entity) => (
            <EntityRow key={entity.id} entity={entity} onClick={goSources} />
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
      subtitle={entity.model.statusText}
      meta="now"
      onClick={onClick}
    />
  );
}
