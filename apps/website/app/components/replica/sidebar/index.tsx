import {
  IconAlbum2,
  IconBookmark,
  IconChevronDown,
  IconClockPlus,
  IconFolder,
  IconFolderBan,
  IconFolderBolt,
  IconNodes3,
  IconPlus,
  IconShuffle,
  IconTrashXmark,
  IconWindowDownload,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { Button, Sidebar } from "@pond/ui";
import Image from "next/image";
import { FishMark } from "../fish-mark";
import type { FishColor, FishSpecies } from "../fish-mark/types";
import styles from "./styles.module.css";

export type SidebarTarget =
  | "all"
  | "sources"
  | "downloads"
  | `fish:${string}`
  | `folder:${string}`;

interface RowSpec {
  id: SidebarTarget;
  label: string;
  Icon: IconComponent;
  count?: string;
  color?: string;
}

const DESTINATIONS: RowSpec[] = [
  { id: "all", label: "All", Icon: IconAlbum2, count: "1,284" },
  {
    id: "folder:uncategorized",
    label: "Uncategorized",
    Icon: IconFolderBan,
    count: "212",
  },
  {
    id: "folder:recent",
    label: "Recently Added",
    Icon: IconClockPlus,
    count: "48",
  },
  { id: "folder:tags", label: "Tags", Icon: IconBookmark, count: "37" },
  { id: "folder:random", label: "Random", Icon: IconShuffle },
  { id: "folder:trash", label: "Trash", Icon: IconTrashXmark, count: "12" },
];

const HARVESTING: RowSpec[] = [
  { id: "sources", label: "Sources", Icon: IconNodes3, count: "11" },
  { id: "downloads", label: "Downloads", Icon: IconWindowDownload },
];

const SMART_FOLDERS: RowSpec[] = [
  {
    id: "folder:this-week",
    label: "Saved This Week",
    Icon: IconFolderBolt,
    count: "64",
  },
  { id: "folder:videos", label: "Videos", Icon: IconFolderBolt, count: "129" },
];

const FISH: {
  id: SidebarTarget;
  name: string;
  color: FishColor;
  species: FishSpecies;
  time?: string;
}[] = [
  { id: "fish:koi", name: "Koi", color: "orange", species: "koi", time: "2m" },
  {
    id: "fish:sorter",
    name: "Sorter",
    color: "teal",
    species: "puffer",
    time: "1h",
  },
];

const FOLDERS: RowSpec[] = [
  {
    id: "folder:cars",
    label: "Cars",
    Icon: IconFolder,
    count: "86",
    color: "var(--ds-red-9)",
  },
  {
    id: "folder:interiors",
    label: "Interiors",
    Icon: IconFolder,
    count: "142",
    color: "var(--ds-orange-9)",
  },
  {
    id: "folder:watches",
    label: "Watches",
    Icon: IconFolder,
    count: "31",
  },
  {
    id: "folder:interface",
    label: "Interface",
    Icon: IconFolder,
    count: "208",
    color: "var(--ds-blue-9)",
  },
  {
    id: "folder:gardens",
    label: "Gardens",
    Icon: IconFolder,
    count: "57",
    color: "var(--ds-green-9)",
  },
  { id: "folder:food", label: "Food", Icon: IconFolder, count: "44" },
];

function Row({ row, active }: { row: RowSpec; active: SidebarTarget }) {
  return (
    <Sidebar.Item data-status={row.id === active ? "active" : undefined}>
      <Sidebar.Icon>
        <row.Icon style={row.color ? { color: row.color } : undefined} />
      </Sidebar.Icon>
      <Sidebar.ItemLabel>{row.label}</Sidebar.ItemLabel>
      {row.count ? <Sidebar.Count>{row.count}</Sidebar.Count> : null}
    </Sidebar.Item>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Sidebar.CollapsibleGroup>
      <Sidebar.GroupHeader>
        <Sidebar.CollapsibleGroupLabel>{label}</Sidebar.CollapsibleGroupLabel>
        <Button icon size="sm" variant="ghost" aria-label={`New in ${label}`}>
          <IconPlus />
        </Button>
      </Sidebar.GroupHeader>
      <Sidebar.CollapsibleGroupContent>
        {children}
      </Sidebar.CollapsibleGroupContent>
    </Sidebar.CollapsibleGroup>
  );
}

export function ReplicaSidebar({ active }: { active: SidebarTarget }) {
  return (
    <Sidebar.Root className={styles.root} width="full">
      <Sidebar.Header className={styles.workspace}>
        <Button variant="ghost" size="sm" className={styles.trigger}>
          <Image
            className={styles.icon}
            src="/replica/library-icon.png"
            alt=""
            width={20}
            height={20}
          />
          <span className={styles.name}>Personal</span>
          <IconChevronDown size={12} className={styles.chevron} aria-hidden />
        </Button>
        <Button icon size="sm" variant="ghost" aria-label="New">
          <IconPlus />
        </Button>
      </Sidebar.Header>
      <Sidebar.Scroll className={styles.scroll}>
        <Sidebar.Group>
          {DESTINATIONS.map((row) => (
            <Row key={row.id} row={row} active={active} />
          ))}
        </Sidebar.Group>
        <Sidebar.Group>
          <Sidebar.GroupLabel>Harvesting</Sidebar.GroupLabel>
          {HARVESTING.map((row) => (
            <Row key={row.id} row={row} active={active} />
          ))}
        </Sidebar.Group>
        <Section label="Smart Folders">
          {SMART_FOLDERS.map((row) => (
            <Row key={row.id} row={row} active={active} />
          ))}
        </Section>
        <Section label="Fish">
          {FISH.map((fish) => (
            <Sidebar.Item
              key={fish.id}
              data-status={fish.id === active ? "active" : undefined}
            >
              <Sidebar.Icon>
                <FishMark color={fish.color} species={fish.species} />
              </Sidebar.Icon>
              <Sidebar.ItemLabel>{fish.name}</Sidebar.ItemLabel>
              {fish.time ? <Sidebar.Count>{fish.time}</Sidebar.Count> : null}
            </Sidebar.Item>
          ))}
        </Section>
        <Section label="Folders">
          {FOLDERS.map((row) => (
            <Row key={row.id} row={row} active={active} />
          ))}
        </Section>
      </Sidebar.Scroll>
    </Sidebar.Root>
  );
}
