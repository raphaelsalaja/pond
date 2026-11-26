import {
  IconBulletList,
  IconCircleCheck,
  IconCircleUser,
  IconCircleWarning,
  IconCircleXmark,
  IconFolder,
  IconGrid,
  IconLayers,
  IconMediaPause,
  IconMediaPlay,
  IconNodes3,
  IconOrderedList,
  IconRefresh,
  IconTv,
  IconUser,
} from "@pond/icons";
import { Sidebar } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { SOURCE_STATUS_OPTIONS } from "@/features/sources/components/page/lib/filters";
import type { SourceStatusId } from "@/features/sources/components/page/lib/filters";
import { useSourceTableRows } from "@/features/sources/hooks/use-source-table-rows";
import { startConnect, startWatch } from "@/features/sources/lib/create";
import { buildSourceNewMenuItems } from "@/features/sources/lib/create-menu";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import {
  sourcesFilters,
  useSourcesFilters,
} from "@/features/sources/state/sources-filters";
import { SpecMoreMenu } from "@/shared/components/spec-context-menu";

const STATUS_ICONS = {
  active: <IconCircleCheck />,
  syncing: <IconRefresh />,
  failed: <IconCircleWarning />,
  paused: <IconMediaPause />,
  offline: <IconCircleXmark />,
} satisfies Record<SourceStatusId, ReactNode>;

const TYPES: Array<{ label: string; icon: ReactNode }> = [
  { label: "Account", icon: <IconUser /> },
  { label: "Folder", icon: <IconFolder /> },
  { label: "Channel", icon: <IconTv /> },
  { label: "Group", icon: <IconCircleUser /> },
  { label: "Playlist", icon: <IconMediaPlay /> },
  { label: "Board", icon: <IconGrid /> },
  { label: "Cluster", icon: <IconLayers /> },
  { label: "Feed", icon: <IconBulletList /> },
  { label: "List", icon: <IconOrderedList /> },
];

function only<T>(set: ReadonlySet<T>, value: T): boolean {
  return set.size === 1 && set.has(value);
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
  count: number;
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
      <Sidebar.Count>{count.toLocaleString("en-US")}</Sidebar.Count>
    </Sidebar.Item>
  );
}

function show(statuses: Array<SourceStatusId>, types: Array<string>): void {
  sourcesFilters.setStatuses(new Set(statuses));
  sourcesFilters.setTypes(new Set(types));
}

export function SourcesSidebar() {
  const { rows } = useSourceTableRows();
  const filters = useSourcesFilters();
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.kindLabel, (counts.get(row.kindLabel) ?? 0) + 1);
    }
    return counts;
  }, [rows]);
  const unfiltered = filters.statuses.size === 0 && filters.types.size === 0;
  const client = useQueryClient();

  return (
    <>
      <Sidebar.Group>
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Sources</Sidebar.GroupLabel>
          <SpecMoreMenu
            label="More Source Actions"
            buildItems={() =>
              buildSourceNewMenuItems({
                onConnect: (source) => void startConnect(source),
                onWatch: startWatch,
                onFolder: () =>
                  void pickWatchedFolder().then(() =>
                    client.invalidateQueries({ queryKey: ["watched-folder"] }),
                  ),
              })
            }
          />
        </Sidebar.GroupHeader>
        <Sidebar.GroupContent aria-label="Status">
          <Row
            label="All"
            icon={<IconNodes3 />}
            count={rows.length}
            active={unfiltered}
            onClick={() => show([], [])}
          />
          {SOURCE_STATUS_OPTIONS.map((status) => (
            <Row
              key={status.id}
              label={status.label}
              icon={STATUS_ICONS[status.id]}
              count={rows.filter((row) => row.statusId === status.id).length}
              active={
                filters.types.size === 0 && only(filters.statuses, status.id)
              }
              onClick={() => show([status.id], [])}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Sidebar.Group>
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Type</Sidebar.GroupLabel>
        </Sidebar.GroupHeader>
        <Sidebar.GroupContent aria-label="Type">
          {TYPES.map((type) => (
            <Row
              key={type.label}
              label={type.label}
              icon={type.icon}
              count={typeCounts.get(type.label) ?? 0}
              active={
                filters.statuses.size === 0 && only(filters.types, type.label)
              }
              onClick={() => show([], [type.label])}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </>
  );
}
