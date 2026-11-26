import {
  IconArchiveDownload,
  IconBan,
  IconBroom,
  IconCircleCheck,
  IconCircleDashedClock,
  IconCircleWarning,
  IconCircleXmark,
  IconMediaPause,
  IconMediaPlay,
  IconRefresh,
  IconWindowDownload,
} from "@pond/icons";
import { Sidebar } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  canRetryDownload,
  canTrashDownload,
  clearUnfinishedDownloads,
  retryDownloadRows,
} from "@/features/downloads/components/lib/actions";
import { usePipelinePause } from "@/features/downloads/hooks/use-pipeline-pause";
import {
  defaultDownloadFilters,
  projectLiveDownloads,
  STATUS_FILTER_OPTIONS,
  statusBucket,
} from "@/features/downloads/lib/status-feed";
import type { StatusFilter } from "@/features/downloads/lib/status-feed";
import { downloadDialog } from "@/features/downloads/state/download-dialog";
import {
  downloadsFilters,
  useDownloadsFilters,
} from "@/features/downloads/state/downloads-filters";
import { useSaves } from "@/features/saves/pool";
import { SpecMoreMenu } from "@/shared/components/spec-context-menu";

const STATUS_ICONS = {
  active: <IconMediaPlay />,
  waiting: <IconCircleDashedClock />,
  failed: <IconCircleWarning />,
  cancelled: <IconCircleXmark />,
  skipped: <IconBan />,
  complete: <IconCircleCheck />,
} satisfies Record<StatusFilter, ReactNode>;

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
      {count !== undefined ? (
        <Sidebar.Count>{count.toLocaleString("en-US")}</Sidebar.Count>
      ) : null}
    </Sidebar.Item>
  );
}

export function DownloadsSidebar() {
  const saves = useSaves();
  const { statuses } = useDownloadsFilters();
  const pause = usePipelinePause();
  const live = useMemo(() => projectLiveDownloads(saves), [saves]);
  const counts = useMemo(() => {
    const next = new Map<StatusFilter, number>();
    for (const row of live) {
      const bucket = statusBucket(row.status);
      next.set(bucket, (next.get(bucket) ?? 0) + 1);
    }
    return next;
  }, [live]);

  function moreItems(): Array<MenuItemSpec> {
    return [
      {
        label: "Download Video or Audio",
        icon: <IconArchiveDownload />,
        onClick: () => downloadDialog.open(),
      },
      { type: "separator" },
      {
        label: "Retry Failed",
        icon: <IconRefresh />,
        disabled: !live.some(canRetryDownload),
        onClick: () => void retryDownloadRows(live),
      },
      {
        label: pause.paused ? "Resume Queue" : "Pause Queue",
        icon: pause.paused ? <IconMediaPlay /> : <IconMediaPause />,
        disabled: !pause.ready || pause.pending,
        onClick: pause.toggle,
      },
      {
        label: "Clear Unfinished",
        icon: <IconBroom />,
        disabled: !live.some(canTrashDownload),
        onClick: () => void clearUnfinishedDownloads(),
      },
    ];
  }
  const unfinished = defaultDownloadFilters().statuses;
  const unfinishedCount = [...unfinished].reduce(
    (sum, id) => sum + (counts.get(id) ?? 0),
    0,
  );

  return (
    <Sidebar.Group>
      <Sidebar.GroupHeader>
        <Sidebar.GroupLabel>Downloads</Sidebar.GroupLabel>
        <SpecMoreMenu label="More Download Actions" buildItems={moreItems} />
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
