import {
  IconAlbum2,
  IconCanvas,
  IconChevronDown,
  IconClockPlus,
  IconFolder,
  IconFolderBan,
  IconFolderSearch,
  IconPlus,
  IconTag,
  IconTagSlash,
  IconTrash,
} from "@pond/icons";
import { Logo } from "@pond/ui/logo";
import type { ReactNode } from "react";
import { ease, mix, progress } from "../../motion";
import styles from "./styles.module.css";

export interface Place {
  label: string;
  icon: ReactNode;
  /** A count, or trailing text such as a fish's last reply time. */
  count?: number | string;
  active?: boolean;
}

/** A Smart Folder or folder row that grows in at `at`. */
export interface TreeRow {
  label: string;
  at: number;
  count?: number;
  depth?: number;
  color?: string;
  /** Flashes the row again at this time, as when a save lands in the folder. */
  pulse?: number;
}

export interface CanvasRow {
  label: string;
  active?: boolean;
}

/** The library's fixed places. All is active unless a canvas or other page is open. */
export const libraryPlaces = (
  all: number,
  tags: number,
  allActive = true,
): Array<Place> => [
  { label: "All", icon: <IconAlbum2 />, count: all, active: allActive },
  { label: "Uncategorized", icon: <IconFolderBan />, count: 0 },
  { label: "Untagged", icon: <IconTagSlash />, count: 0 },
  { label: "Recently Added", icon: <IconClockPlus />, count: all },
  { label: "Tags", icon: <IconTag />, count: tags },
  { label: "Trash", icon: <IconTrash />, count: 0 },
];

interface RowProps extends Omit<TreeRow, "label"> {
  t: number;
  icon: ReactNode;
  label: string;
}

/** A tree row that grows into place as it lands, so rows below slide instead of jumping. */
function Row({ t, at, icon, label, count, depth = 0, color, pulse }: RowProps) {
  const k = ease.outQuint(progress(t, at, 520));
  if (k <= 0) {
    return null;
  }
  const again =
    pulse === undefined || t < pulse
      ? 0
      : ease.out(progress(t, pulse, 120)) *
        (1 - ease.out(progress(t, pulse + 260, 900)));
  const flash = Math.max(1 - ease.out(progress(t, at + 120, 700)), again);
  return (
    <span
      className={styles.row}
      style={{
        height: mix(0, 28, k),
        marginBottom: mix(-1, 0, k),
        opacity: ease.out(progress(t, at + 60, 360)),
        transform: `translateX(${(1 - k) * -10}px)`,
        paddingLeft: 6 + depth * 18,
        background:
          flash > 0.01
            ? `color-mix(in oklab, ${color ?? "var(--ds-foreground-tertiary)"} ${flash * 14}%, transparent)`
            : undefined,
      }}
    >
      <span className={styles.glyph} style={color ? { color } : undefined}>
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
      {count === undefined ? null : (
        <span className={styles.count}>{count}</span>
      )}
    </span>
  );
}

function Places({ rows }: { rows: Array<Place> }) {
  return (
    <div className={styles.group}>
      {rows.map((row) => (
        <span
          key={row.label}
          className={styles.place}
          data-active={row.active || undefined}
        >
          {row.icon}
          <span className={styles.label}>{row.label}</span>
          <span className={styles.count}>{row.count}</span>
        </span>
      ))}
    </div>
  );
}

interface SidebarProps {
  t: number;
  places: Array<Place>;
  /** The Harvesting group; omitted when not passed. */
  harvesting?: Array<Place>;
  /** The Fish group; omitted when not passed. */
  fish?: Array<Place>;
  smart?: Array<TreeRow>;
  canvases?: Array<CanvasRow>;
  folders?: Array<TreeRow>;
  workspace?: string;
  plusPressed?: boolean;
  /** `2.0` is the wider sidebar with 16px icons and quieter rows. */
  look?: "1.0" | "2.0";
}

/** Pond's sidebar: workspace switcher, library places, Smart Folders, and the folder tree. */
export function Sidebar({
  t,
  places,
  harvesting,
  fish,
  smart = [],
  canvases = [],
  folders = [],
  workspace = "Personal",
  plusPressed = false,
  look = "1.0",
}: SidebarProps) {
  return (
    <nav className={styles.sidebar} data-look={look}>
      <div className={styles.workspace}>
        <span className={styles.switcher}>
          <span className={styles.mark}>
            <Logo size={12} aria-hidden />
          </span>
          <span className={styles.name}>{workspace}</span>
          <IconChevronDown size={10} />
        </span>
        <span className={styles.plus} data-pressed={plusPressed || undefined}>
          <IconPlus size={14} />
        </span>
      </div>
      <Places rows={places} />
      {harvesting ? (
        <>
          <span className={styles.section}>Harvesting</span>
          <Places rows={harvesting} />
        </>
      ) : null}
      <span className={styles.section}>
        Smart Folders
        <IconPlus size={14} />
      </span>
      <div className={styles.group}>
        {smart.map((row) => (
          <Row key={row.label} t={t} icon={<IconFolderSearch />} {...row} />
        ))}
      </div>
      {fish ? (
        <>
          <span className={styles.section}>
            Fish
            <IconPlus size={14} />
          </span>
          <Places rows={fish} />
        </>
      ) : null}
      <span className={styles.section}>
        Canvases
        <IconPlus size={14} />
      </span>
      <div className={styles.group}>
        {canvases.map((row) => (
          <span
            key={row.label}
            className={styles.place}
            data-active={row.active || undefined}
          >
            <IconCanvas />
            <span className={styles.label}>{row.label}</span>
          </span>
        ))}
      </div>
      <span className={styles.section}>
        Folders
        <IconPlus size={14} />
      </span>
      <div className={styles.group}>
        {folders.map((row) => (
          <Row key={row.label} t={t} icon={<IconFolder />} {...row} />
        ))}
      </div>
    </nav>
  );
}
