import {
  IconAlbum2,
  IconChevronDown,
  IconCircleWarning,
  IconEye,
  IconFolder,
  IconFolderBan,
  IconFolderOpen,
  IconHistory,
  IconPlus,
  IconShuffle,
  IconTag,
  IconTrashXmark,
  IconUser,
  IconWindowDownload,
} from "@pond/icons";
import type { SidebarDestination } from "@pond/schema";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

const library: ReadonlyArray<{
  id: SidebarDestination;
  label: string;
  count: string;
  icon: ReactNode;
}> = [
  { id: "all", label: "All", count: "1,284", icon: <IconAlbum2 /> },
  {
    id: "uncategorized",
    label: "Uncategorized",
    count: "36",
    icon: <IconFolderBan />,
  },
  {
    id: "recentlyUsed",
    label: "Recently Used",
    count: "18",
    icon: <IconHistory />,
  },
  { id: "tags", label: "Tags", count: "58", icon: <IconTag /> },
  { id: "random", label: "Random", count: "", icon: <IconShuffle /> },
  { id: "trash", label: "Trash", count: "3", icon: <IconTrashXmark /> },
];
const folders = [
  { label: "Inspiration", count: "248" },
  { label: "Photography", count: "96" },
] as const;
const sources = [
  { label: "Accounts", count: "4", icon: <IconUser /> },
  { label: "Watches", count: "2", icon: <IconEye /> },
  { label: "Folders", count: "1", icon: <IconFolderOpen /> },
] as const;
const queues = [
  { label: "Active", count: "2", icon: <IconWindowDownload /> },
  { label: "Waiting", count: "2", icon: <IconHistory /> },
  { label: "Failed", count: "0", icon: <IconCircleWarning /> },
] as const;

function Row({
  active = false,
  hidden = false,
  count,
  icon,
  label,
}: {
  active?: boolean;
  hidden?: boolean;
  count: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      className={styles.row}
      data-active={active || undefined}
      data-hidden={hidden || undefined}
    >
      {icon}
      <span className={styles.label}>{label}</span>
      <span className={styles.count}>{count}</span>
    </span>
  );
}

function LibraryNav({
  name,
  hidden,
}: {
  name: string;
  hidden: readonly SidebarDestination[];
}) {
  return (
    <nav className={styles.nav} data-view="library">
      <span className={styles.switcher}>
        <span className={styles.mark} />
        <span className={styles.label}>{name}</span>
        <IconChevronDown size={12} />
      </span>
      {library.map((item, index) => (
        <Row
          active={index === 0}
          hidden={hidden.includes(item.id)}
          count={item.count}
          icon={item.icon}
          key={item.id}
          label={item.label}
        />
      ))}
      <span className={styles.section}>
        Folders
        <IconPlus />
      </span>
      {folders.map((item) => (
        <Row
          count={item.count}
          icon={<IconFolder />}
          key={item.label}
          label={item.label}
        />
      ))}
    </nav>
  );
}

function HarvesterNav() {
  return (
    <nav className={styles.nav} data-view="harvest">
      <span className={styles.brand}>
        Harvester
        <IconPlus />
      </span>
      <span className={styles.section}>Sources</span>
      {sources.map((item) => (
        <Row
          count={item.count}
          icon={item.icon}
          key={item.label}
          label={item.label}
        />
      ))}
      <span className={styles.section}>Downloads</span>
      {queues.map((item, index) => (
        <Row
          active={index === 0}
          count={item.count}
          icon={item.icon}
          key={item.label}
          label={item.label}
        />
      ))}
    </nav>
  );
}

export function Sidebar({
  name = "Personal",
  hidden = [],
}: {
  name?: string;
  hidden?: readonly SidebarDestination[];
}) {
  return (
    <div className={styles.sidebar}>
      <LibraryNav name={name} hidden={hidden} />
      <HarvesterNav />
    </div>
  );
}
