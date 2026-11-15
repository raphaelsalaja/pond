import { clsx as cn } from "clsx";
import {
  HUB_RADIUS,
  RING_SIZE,
  RING_SLOTS,
  type RingSlot,
  sectorPath,
  slotAnchor,
} from "../geometry";
import type { RingLayout } from "../slots";
import styles from "./styles.module.css";

const SECTOR_PATHS = new Map(
  RING_SLOTS.map((slot) => [slot, sectorPath(slot)]),
);
const HUB_STYLE = { width: `${((HUB_RADIUS * 2) / RING_SIZE) * 100}%` };

interface RootProps extends React.ComponentProps<"fieldset"> {
  open?: boolean;
  live?: boolean;
  /** Solid where nothing behind the window can be blurred, as over other apps. */
  surface?: "glass" | "solid";
}

function Root({
  open,
  live,
  surface = "glass",
  className,
  ...props
}: RootProps) {
  return (
    <fieldset
      className={cn(styles.disc, className)}
      data-open={open || undefined}
      data-live={live || undefined}
      data-surface={surface}
      {...props}
    />
  );
}

interface SectorsProps<Folder> extends React.ComponentPropsWithoutRef<"svg"> {
  layout: RingLayout<Folder>;
  active: RingSlot | null;
}

function Sectors<Folder>({
  layout,
  active,
  className,
  ...props
}: SectorsProps<Folder>) {
  return (
    <svg
      className={cn(styles.sectors, className)}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      aria-hidden="true"
      {...props}
    >
      {RING_SLOTS.map((slot) => (
        <path
          key={slot}
          className={styles.sector}
          d={SECTOR_PATHS.get(slot)}
          data-kind={layout[slot]?.kind ?? "empty"}
          data-active={active === slot || undefined}
        />
      ))}
    </svg>
  );
}

interface SlotsProps extends React.ComponentPropsWithoutRef<"ul"> {}

function Slots({ className, ...props }: SlotsProps) {
  return <ul className={cn(styles.slots, className)} {...props} />;
}

interface SlotProps extends React.ComponentPropsWithoutRef<"li"> {
  slot: RingSlot;
  kind: "folder" | "action";
  disabled?: boolean;
}

function Slot({ slot, kind, disabled, className, style, ...props }: SlotProps) {
  const anchor = slotAnchor(slot);
  return (
    <li
      className={cn(styles.slot, className)}
      data-kind={kind}
      data-disabled={disabled || undefined}
      style={{ left: `${anchor.left}%`, top: `${anchor.top}%`, ...style }}
      {...props}
    />
  );
}

interface LabelProps extends React.ComponentPropsWithoutRef<"span"> {}

function Label({ className, ...props }: LabelProps) {
  return <span className={cn(styles.label, className)} {...props} />;
}

interface ThumbsProps extends React.ComponentPropsWithoutRef<"span"> {}

function Thumbs({ className, ...props }: ThumbsProps) {
  return <span className={cn(styles.thumbs, className)} {...props} />;
}

interface ThumbProps extends React.ComponentPropsWithoutRef<"img"> {}

function Thumb({ className, alt = "", ...props }: ThumbProps) {
  return (
    <img
      className={cn(styles.thumb, className)}
      alt={alt}
      draggable={false}
      {...props}
    />
  );
}

interface FallbackProps extends React.ComponentPropsWithoutRef<"span"> {}

function Fallback({ className, ...props }: FallbackProps) {
  return <span className={cn(styles.fallback, className)} {...props} />;
}

interface NameProps extends React.ComponentPropsWithoutRef<"span"> {}

/** Read by screen readers only; the hub shows the name to everyone else. */
function Name({ className, ...props }: NameProps) {
  return <span className={cn(styles.name, className)} {...props} />;
}

interface HubProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  title: string;
  detail?: string;
}

function Hub({ title, detail, className, style, ...props }: HubProps) {
  return (
    <div
      className={cn(styles.hub, className)}
      style={{ ...HUB_STYLE, ...style }}
      aria-hidden="true"
      {...props}
    >
      <span className={styles.title}>{title}</span>
      {detail ? <span className={styles.detail}>{detail}</span> : null}
    </div>
  );
}

export const Disc = {
  Root,
  Sectors,
  Slots,
  Slot,
  Label,
  Thumbs,
  Thumb,
  Fallback,
  Name,
  Hub,
};
