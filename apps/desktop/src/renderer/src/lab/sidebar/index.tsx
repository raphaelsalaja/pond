import {
  IconBan,
  IconCircleCheck,
  IconCircleDashedClock,
  IconCircleWarning,
  IconCircleXmark,
  IconEye,
  IconFolder,
  IconMediaPause,
  IconNodes3,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconUser,
  IconWindowDownload,
} from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import { Badge, Button, Sidebar } from "@pond/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Row } from "@/features/library/components/folder-sidebar/sidebar-row";
import { BrandTile } from "@/features/sources";
import {
  DOWNLOAD_SOURCES,
  DOWNLOAD_STATUSES,
  RUNNING,
  SOURCE_STATUSES,
  SOURCES,
  type SourceHealth,
  type SourceRow,
  TRANSFERS,
} from "./fixtures";
import styles from "./styles.module.css";

const ROOT = "/Users/raphaelsalaja/Developer/pond";
const SOURCE = "apps/desktop/src/renderer/src/lab/sidebar/index.tsx";

const STATUS_ICONS: Record<string, ReactNode> = {
  active: <IconWindowDownload />,
  waiting: <IconCircleDashedClock />,
  failed: <IconCircleWarning />,
  cancelled: <IconCircleXmark />,
  skipped: <IconBan />,
  complete: <IconCircleCheck />,
};

const HEALTH_ICONS: Record<SourceHealth, ReactNode> = {
  active: <IconCircleCheck />,
  syncing: <IconRefresh />,
  failed: <IconCircleWarning />,
  paused: <IconMediaPause />,
  offline: <IconCircleXmark />,
};

/** React 19 assigns props as properties on defined elements, and these are getter-only, so set them as attributes. */
function Entry({
  component,
  state,
  children,
}: {
  component: string;
  state: string;
  children: ReactNode;
}) {
  return (
    <lab-entry
      className={styles.entry}
      ref={(node) => {
        node?.setAttribute("component", component);
        node?.setAttribute("state", state);
        node?.setAttribute("source", SOURCE);
      }}
    >
      {children}
    </lab-entry>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Sidebar.Root className={styles.frame} width="full" aria-label={label}>
      <Sidebar.Scroll className={styles.scroll}>{children}</Sidebar.Scroll>
    </Sidebar.Root>
  );
}

function Header({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <Sidebar.GroupHeader>
      <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
      {children}
    </Sidebar.GroupHeader>
  );
}

function PauseAction() {
  return (
    <Button icon size="xs" variant="ghost" aria-label="Pause Queue">
      <IconMediaPause />
    </Button>
  );
}

function NewSourceAction() {
  return (
    <Button icon size="xs" variant="ghost" aria-label="New Source">
      <IconPlus />
    </Button>
  );
}

function Brand({ source, size = 16 }: { source: Source; size?: number }) {
  return <BrandTile source={source} size={size} />;
}

function HealthDot({ health }: { health: SourceHealth }) {
  switch (health) {
    case "failed":
      return <Badge.Dot tone="negative" aria-label="Failed" />;
    case "syncing":
      return <Badge.Dot tone="accent" live aria-label="Syncing" />;
    case "paused":
    case "offline":
      return <Badge.Dot aria-label={health === "paused" ? "Paused" : "Offline"} />;
    case "active":
      return null;
  }
}

function StatusGroup({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const total = DOWNLOAD_STATUSES.reduce((sum, row) => sum + row.count, 0);
  return (
    <Sidebar.Group>
      <Header label="Downloads">
        <PauseAction />
      </Header>
      <Sidebar.GroupContent>
        <Row
          label="All"
          icon={<IconWindowDownload />}
          count={total}
          active={selected === "all"}
          onClick={() => onSelect("all")}
        />
        {DOWNLOAD_STATUSES.map((row) => (
          <Row
            key={row.id}
            label={row.label}
            icon={STATUS_ICONS[row.id]}
            count={row.count}
            downloading={row.id === "active" ? row.count : 0}
            active={selected === row.id}
            onClick={() => onSelect(row.id)}
          />
        ))}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}

function DownloadSourcesGroup({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Sidebar.Group>
      <Header label="Sources" />
      <Sidebar.GroupContent>
        {DOWNLOAD_SOURCES.map((row) => (
          <Row
            key={row.source}
            label={sourceLabel(row.source)}
            icon={<Brand source={row.source} />}
            count={row.count}
            status={
              row.gate === "limited"
                ? `Retry in ${row.retry}`
                : row.gate === "paused"
                  ? "Paused"
                  : undefined
            }
            active={selected === row.source}
            onClick={() => onSelect(row.source)}
          />
        ))}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}

function TransfersGroup({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Sidebar.Group>
      <Header label="Transfers" />
      <Sidebar.GroupContent>
        {TRANSFERS.map((row) => (
          <Sidebar.Item
            key={row.id}
            size="lg"
            data-status={selected === row.id ? "active" : undefined}
            onClick={() => onSelect(row.id)}
          >
            <Sidebar.Icon>
              <IconPackage />
            </Sidebar.Icon>
            <Sidebar.ItemText>
              <Sidebar.ItemLabel>{row.label}</Sidebar.ItemLabel>
              <Sidebar.ItemDetail>{row.detail}</Sidebar.ItemDetail>
            </Sidebar.ItemText>
            {row.failed ? (
              <Sidebar.Count>
                <Badge.Dot tone="negative" aria-label="Failed" />
              </Sidebar.Count>
            ) : null}
          </Sidebar.Item>
        ))}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}

function DownloadsStatus() {
  const [selected, setSelected] = useState("all");
  return (
    <Panel label="Downloads">
      <StatusGroup selected={selected} onSelect={setSelected} />
    </Panel>
  );
}

function DownloadsStatusSources() {
  const [selected, setSelected] = useState("all");
  return (
    <Panel label="Downloads">
      <StatusGroup selected={selected} onSelect={setSelected} />
      <DownloadSourcesGroup selected={selected} onSelect={setSelected} />
    </Panel>
  );
}

function DownloadsWithTransfers() {
  const [selected, setSelected] = useState("all");
  return (
    <Panel label="Downloads">
      <StatusGroup selected={selected} onSelect={setSelected} />
      <DownloadSourcesGroup selected={selected} onSelect={setSelected} />
      <TransfersGroup selected={selected} onSelect={setSelected} />
    </Panel>
  );
}

function DownloadsLiveQueue() {
  const [selected, setSelected] = useState("r1");
  return (
    <Panel label="Downloads">
      <Sidebar.Group>
        <Header label="Downloading">
          <PauseAction />
        </Header>
        <Sidebar.GroupContent>
          {RUNNING.map((row) => (
            <Sidebar.Item
              key={row.id}
              size="lg"
              data-status={selected === row.id ? "active" : undefined}
              onClick={() => setSelected(row.id)}
            >
              <Sidebar.Icon>
                <Brand source={row.source} size={28} />
              </Sidebar.Icon>
              <Sidebar.ItemText>
                <Sidebar.ItemLabel>{row.title}</Sidebar.ItemLabel>
                <Sidebar.ItemDetail>{row.detail}</Sidebar.ItemDetail>
              </Sidebar.ItemText>
            </Sidebar.Item>
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Sidebar.Group>
        <Header label="Queue" />
        <Sidebar.GroupContent>
          {DOWNLOAD_STATUSES.filter((row) => row.id !== "active").map((row) => (
            <Row
              key={row.id}
              label={row.label}
              icon={STATUS_ICONS[row.id]}
              count={row.count}
              active={selected === row.id}
              onClick={() => setSelected(row.id)}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Panel>
  );
}

const HEALTH_RANK: Record<SourceHealth, number> = {
  failed: 0,
  syncing: 1,
  offline: 2,
  paused: 3,
  active: 4,
};

function platforms(rows: SourceRow[]) {
  const bySource = new Map<Source, SourceRow[]>();
  for (const row of rows) {
    if (row.kind === "folder") continue;
    bySource.set(row.source, [...(bySource.get(row.source) ?? []), row]);
  }
  return [...bySource.entries()].map(([source, items]) => ({
    source,
    count: items.length,
    health: items
      .map((item) => item.health)
      .sort((a, b) => HEALTH_RANK[a] - HEALTH_RANK[b])[0] ?? "active",
  }));
}

function PlatformsGroup({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string;
  selected: string;
  onSelect: (id: string) => void;
  children?: ReactNode;
}) {
  const folder = SOURCES.find((row) => row.kind === "folder");
  return (
    <Sidebar.Group>
      <Header label={label}>{children}</Header>
      <Sidebar.GroupContent>
        <Row
          label="All"
          icon={<IconNodes3 />}
          count={SOURCES.length}
          active={selected === "all"}
          onClick={() => onSelect("all")}
        />
        {platforms(SOURCES).map((row) => (
          <Row
            key={row.source}
            label={sourceLabel(row.source)}
            icon={<Brand source={row.source} />}
            count={row.count}
            status={
              row.health === "active" ? undefined : (
                <span className={styles.status}>
                  <HealthDot health={row.health} />
                  {row.count}
                </span>
              )
            }
            active={selected === row.source}
            onClick={() => onSelect(row.source)}
          />
        ))}
        {folder ? (
          <Row
            label="Watched Folder"
            icon={<IconFolder />}
            active={selected === folder.id}
            onClick={() => onSelect(folder.id)}
          />
        ) : null}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}

function SourcesPlatforms() {
  const [selected, setSelected] = useState("all");
  return (
    <Panel label="Sources">
      <PlatformsGroup label="Sources" selected={selected} onSelect={setSelected}>
        <NewSourceAction />
      </PlatformsGroup>
    </Panel>
  );
}

const KIND_GROUPS: { id: SourceRow["kind"]; label: string; icon: ReactNode }[] =
  [
    { id: "account", label: "Accounts", icon: <IconUser /> },
    { id: "watch", label: "Watches", icon: <IconEye /> },
    { id: "folder", label: "Folder", icon: <IconFolder /> },
  ];

function SourcesStatusType() {
  const [selected, setSelected] = useState("all");
  return (
    <Panel label="Sources">
      <Sidebar.Group>
        <Header label="Sources">
          <NewSourceAction />
        </Header>
        <Sidebar.GroupContent>
          <Row
            label="All"
            icon={<IconNodes3 />}
            count={SOURCES.length}
            active={selected === "all"}
            onClick={() => setSelected("all")}
          />
          {SOURCE_STATUSES.map((status) => (
            <Row
              key={status.id}
              label={status.label}
              icon={HEALTH_ICONS[status.id]}
              count={SOURCES.filter((row) => row.health === status.id).length}
              active={selected === status.id}
              onClick={() => setSelected(status.id)}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Sidebar.Group>
        <Header label="Type" />
        <Sidebar.GroupContent>
          {KIND_GROUPS.map((kind) => (
            <Row
              key={kind.id}
              label={kind.label}
              icon={kind.icon}
              count={SOURCES.filter((row) => row.kind === kind.id).length}
              active={selected === kind.id}
              onClick={() => setSelected(kind.id)}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Panel>
  );
}

function SourceItem({
  row,
  selected,
  onSelect,
}: {
  row: SourceRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Sidebar.Item
      size="lg"
      data-status={selected ? "active" : undefined}
      onClick={onSelect}
    >
      <Sidebar.Icon>
        {row.kind === "folder" ? (
          <IconFolder />
        ) : (
          <Brand source={row.source} size={28} />
        )}
      </Sidebar.Icon>
      <Sidebar.ItemText>
        <Sidebar.ItemLabel>{row.label}</Sidebar.ItemLabel>
        <Sidebar.ItemDetail>{row.detail}</Sidebar.ItemDetail>
      </Sidebar.ItemText>
      {row.health === "active" ? null : (
        <Sidebar.Count>
          <HealthDot health={row.health} />
        </Sidebar.Count>
      )}
    </Sidebar.Item>
  );
}

function SourcesEvery() {
  const [selected, setSelected] = useState("a1");
  return (
    <Panel label="Sources">
      {KIND_GROUPS.map((kind, index) => (
        <Sidebar.Group key={kind.id}>
          <Header label={kind.label}>
            {index === 0 ? <NewSourceAction /> : null}
          </Header>
          <Sidebar.GroupContent>
            {SOURCES.filter((row) => row.kind === kind.id).map((row) => (
              <SourceItem
                key={row.id}
                row={row}
                selected={selected === row.id}
                onSelect={() => setSelected(row.id)}
              />
            ))}
          </Sidebar.GroupContent>
        </Sidebar.Group>
      ))}
    </Panel>
  );
}

function SourcesAttention() {
  const [selected, setSelected] = useState("all");
  const attention = SOURCES.filter(
    (row) => row.health === "failed" || row.health === "offline",
  );
  return (
    <Panel label="Sources">
      <Sidebar.Group>
        <Header label="Needs Attention" />
        <Sidebar.GroupContent>
          {attention.map((row) => (
            <SourceItem
              key={row.id}
              row={row}
              selected={selected === row.id}
              onSelect={() => setSelected(row.id)}
            />
          ))}
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <PlatformsGroup label="Sources" selected={selected} onSelect={setSelected}>
        <NewSourceAction />
      </PlatformsGroup>
    </Panel>
  );
}

export function SidebarLab() {
  useEffect(() => {
    void import("../download/lab.js");
  }, []);
  return (
    <div className={styles.page}>
      <lab-page title="Sidebar" root={ROOT}>
        <Entry component="Downloads" state="Status">
          <DownloadsStatus />
        </Entry>
        <Entry component="Downloads" state="Status And Sources">
          <DownloadsStatusSources />
        </Entry>
        <Entry component="Downloads" state="With Transfers">
          <DownloadsWithTransfers />
        </Entry>
        <Entry component="Downloads" state="Live Queue">
          <DownloadsLiveQueue />
        </Entry>
        <Entry component="Sources" state="Platforms">
          <SourcesPlatforms />
        </Entry>
        <Entry component="Sources" state="Status And Type">
          <SourcesStatusType />
        </Entry>
        <Entry component="Sources" state="Every Source">
          <SourcesEvery />
        </Entry>
        <Entry component="Sources" state="Needs Attention">
          <SourcesAttention />
        </Entry>
      </lab-page>
    </div>
  );
}
