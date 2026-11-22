import {
  IconBan,
  IconCircleCheck,
  IconCircleDashedClock,
  IconCircleWarning,
  IconCircleXmark,
  IconMediaPlay,
  IconWindowDownload,
} from "@pond/icons";
import { Sidebar } from "@pond/ui";
import { type ReactNode, useMemo } from "react";
import {
  defaultDownloadFilters,
  projectLiveDownloads,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
  statusBucket,
} from "@/features/downloads/lib/status-feed";
import {
  downloadsFilters,
  useDownloadsFilters,
} from "@/features/downloads/state/downloads-filters";
import { useSaves } from "@/features/saves/pool";

const STATUS_ICONS: Record<StatusFilter, ReactNode> = {
  active: <IconMediaPlay />,
  waiting: <IconCircleDashedClock />,
  failed: <IconCircleWarning />,
  cancelled: <IconCircleXmark />,
  skipped: <IconBan />,
  complete: <IconCircleCheck />,
};

function sameStatuses(
  a: ReadonlySet<StatusFilter>,
  b: ReadonlySet<StatusFilter>,
): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function Row({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Sidebar.Item
      data-status={active ? "active" : undefined}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      <Sidebar.Icon>{icon}</Sidebar.Icon>
      <Sidebar.ItemLabel>{label}</Sidebar.ItemLabel>
      {count != null ? (
        <Sidebar.Count>{count.toLocaleString("en-US")}</Sidebar.Count>
      ) : null}
    </Sidebar.Item>
  );
}

export function DownloadsSidebar() {
  const saves = useSaves();
  const { statuses } = useDownloadsFilters();
  const counts = useMemo(() => {
    const next = new Map<StatusFilter, number>();
    for (const row of projectLiveDownloads(saves)) {
      const bucket = statusBucket(row.status);
      next.set(bucket, (next.get(bucket) ?? 0) + 1);
    }
    return next;
  }, [saves]);
  const unfinished = defaultDownloadFilters().statuses;
  const unfinishedCount = [...unfinished].reduce(
    (sum, id) => sum + (counts.get(id) ?? 0),
    0,
  );

  return (
    <Sidebar.Group>
      <Sidebar.GroupHeader>
        <Sidebar.GroupLabel>Downloads</Sidebar.GroupLabel>
      </Sidebar.GroupHeader>
      <Sidebar.GroupContent aria-label="Status">
        <Row
          label="Unfinished"
          icon={<IconWindowDownload />}
          count={unfinishedCount}
          active={sameStatuses(statuses, unfinished)}
          onClick={() => downloadsFilters.setStatuses(unfinished)}
        />
        {STATUS_FILTER_OPTIONS.map((option) => (
          <Row
            key={option.id}
            label={option.label}
            icon={STATUS_ICONS[option.id]}
            count={
              option.id === "complete"
                ? undefined
                : (counts.get(option.id) ?? 0)
            }
            active={statuses.size === 1 && statuses.has(option.id)}
            onClick={() => downloadsFilters.setStatuses(new Set([option.id]))}
          />
        ))}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}
