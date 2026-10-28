import { IconPlus } from "@pond/icons";
import { BrandTile, Button, DataTable, type TableColumn } from "@pond/ui";
import { getSource, type SourceId } from "@/lib/sources";
import { SearchChrome } from "../library";
import styles from "./styles.module.css";

type Status = "active" | "syncing" | "paused";

interface Row {
  id: string;
  name: string;
  items: number;
  synced: string;
  status: Status;
  source: SourceId;
  type: string;
}

const STATUS_LABELS = {
  active: "Active",
  syncing: "Syncing",
  paused: "Paused",
} satisfies Record<Status, string>;

const ROWS: Row[] = [
  {
    id: "twitter",
    name: "Bookmarks and Likes",
    items: 3412,
    synced: "2m ago",
    status: "active",
    source: "twitter",
    type: "Account",
  },
  {
    id: "instagram",
    name: "Saved Posts",
    items: 1876,
    synced: "Now",
    status: "syncing",
    source: "instagram",
    type: "Account",
  },
  {
    id: "pinterest",
    name: "Car Design",
    items: 642,
    synced: "14m ago",
    status: "active",
    source: "pinterest",
    type: "Board",
  },
  {
    id: "arena",
    name: "Quiet Interiors",
    items: 318,
    synced: "1h ago",
    status: "active",
    source: "arena",
    type: "Channel",
  },
  {
    id: "cosmos",
    name: "Type and Print",
    items: 954,
    synced: "1h ago",
    status: "active",
    source: "cosmos",
    type: "Cluster",
  },
  {
    id: "youtube",
    name: "Watch Later",
    items: 221,
    synced: "3h ago",
    status: "active",
    source: "youtube",
    type: "Playlist",
  },
  {
    id: "bluesky",
    name: "Likes",
    items: 488,
    synced: "Now",
    status: "syncing",
    source: "bluesky",
    type: "Account",
  },
  {
    id: "savee",
    name: "Studio References",
    items: 1203,
    synced: "5h ago",
    status: "active",
    source: "savee",
    type: "Account",
  },
  {
    id: "dribbble",
    name: "Shots I Liked",
    items: 377,
    synced: "Yesterday",
    status: "active",
    source: "dribbble",
    type: "Account",
  },
  {
    id: "tiktok",
    name: "Favorites",
    items: 165,
    synced: "2d ago",
    status: "paused",
    source: "tiktok",
    type: "Account",
  },
  {
    id: "github",
    name: "Stars",
    items: 92,
    synced: "3d ago",
    status: "active",
    source: "github",
    type: "Account",
  },
];

const RING = 100;

function StatusGlyph({ status }: { status: Status }) {
  return (
    <svg
      className={styles.glyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={status === "active" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={status === "active" ? 1 : 0.45}
      />
      {status === "syncing" ? (
        <circle
          className={styles.spin}
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${0.65 * RING} ${RING}`}
          pathLength={RING}
        />
      ) : null}
      {status === "active" ? (
        <path
          d="M5.2 8.2 7 10 10.8 6"
          fill="none"
          stroke="var(--ds-gray-1)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {status === "paused" ? (
        <>
          <rect x="5.55" y="5.35" width="1.55" height="5.3" rx="0.4" />
          <rect x="8.9" y="5.35" width="1.55" height="5.3" rx="0.4" />
        </>
      ) : null}
    </svg>
  );
}

const numbers = new Intl.NumberFormat("en-US");

const COLUMNS: TableColumn<Row>[] = [
  {
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    width: "minmax(200px, 1fr)",
    cell: (row) => <span className={styles.name}>{row.name}</span>,
  },
  {
    id: "items",
    header: "Items",
    accessor: (row) => row.items,
    width: "minmax(72px, 80px)",
    cell: (row) => (
      <span className={styles.metric}>{numbers.format(row.items)}</span>
    ),
  },
  {
    id: "lastSynced",
    header: "Last Synced",
    accessor: (row) => row.synced,
    width: "minmax(112px, 120px)",
    cell: (row) => <span className={styles.metric}>{row.synced}</span>,
  },
  {
    id: "status",
    header: "Status",
    accessor: (row) => row.status,
    width: "minmax(112px, 120px)",
    cell: (row) => (
      <span className={styles.status}>
        <span className={styles.mark} data-status={row.status}>
          <StatusGlyph status={row.status} />
        </span>
        <span className={styles.meta}>{STATUS_LABELS[row.status]}</span>
      </span>
    ),
  },
  {
    id: "source",
    header: "Source",
    accessor: (row) => row.source,
    width: "minmax(128px, 140px)",
    cell: (row) => {
      const source = getSource(row.source);
      return (
        <span className={styles.source}>
          <BrandTile size={18}>
            <source.Icon width={18} height={18} />
          </BrandTile>
          <span className={styles.meta}>{source.label}</span>
        </span>
      );
    },
  },
  {
    id: "type",
    header: "Type",
    accessor: (row) => row.type,
    width: "minmax(96px, 100px)",
    cell: (row) => <span className={styles.meta}>{row.type}</span>,
  },
];

export function SourcesScene() {
  return (
    <DataTable.Provider
      data={ROWS}
      columns={COLUMNS}
      getRowId={(row) => row.id}
    >
      <div className={styles.page}>
        <SearchChrome
          placeholder="Search sources…"
          actions={
            <Button icon size="sm" variant="ghost" aria-label="New Source">
              <IconPlus />
            </Button>
          }
        />
        <div className={styles.table}>
          <DataTable.Root className={styles.grid} aria-label="Sources" />
        </div>
      </div>
    </DataTable.Provider>
  );
}
