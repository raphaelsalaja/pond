import { createParts } from "@ui-sdk/react/primitive";
import { clsx as cn } from "clsx";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";
import { Tooltip } from "../tooltip";
import { useWindow, WindowContext } from "./context";
import { windowHandle } from "./handle";
import type { WindowSide } from "./handle";
import styles from "./styles.module.css";

const { Root: HandleRoot } = createParts(windowHandle, { root: "div" });

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  leftOpen?: boolean;
  rightOpen?: boolean;
  /** Skips the column animation for one layout change, like a navigation that adds or removes a column. */
  instant?: boolean;
  /** `island` rounds Panes and insets it from the window edges. */
  surface?: "flush" | "island";
}

function Root({
  className,
  children,
  leftOpen = false,
  rightOpen = false,
  instant = false,
  surface = "flush",
  ...props
}: RootProps) {
  const value = useMemo(
    () => ({ state: { left: leftOpen, right: rightOpen } }),
    [leftOpen, rightOpen],
  );

  return (
    <WindowContext value={value}>
      <div
        className={cn(styles.root, className)}
        data-slot="window"
        data-left-open={leftOpen || undefined}
        data-right-open={rightOpen || undefined}
        data-instant={instant || undefined}
        data-surface={surface === "island" ? surface : undefined}
        {...props}
      >
        {children}
      </div>
    </WindowContext>
  );
}

type ToolbarProps = ComponentPropsWithoutRef<"div">;

function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <div
      className={cn(styles.toolbar, className)}
      data-slot="toolbar"
      {...props}
    />
  );
}

type ClusterProps = ComponentPropsWithoutRef<"div">;

function Leading({ className, ...props }: ClusterProps) {
  return (
    <div
      className={cn(styles.leading, className)}
      data-slot="leading"
      {...props}
    />
  );
}

function Trailing({ className, ...props }: ClusterProps) {
  return (
    <div
      className={cn(styles.trailing, className)}
      data-slot="trailing"
      {...props}
    />
  );
}

type PanesProps = ComponentPropsWithoutRef<"div">;

function Panes({ className, ...props }: PanesProps) {
  return (
    <div className={cn(styles.panes, className)} data-slot="panes" {...props} />
  );
}

interface SideProps extends ComponentPropsWithoutRef<"aside"> {
  /** Both columns are `aside` landmarks, so each needs its own name. */
  "aria-label": string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  width?: number;
  /** `false` drops the handle, for a column the page sizes itself. */
  resizable?: boolean;
  resizeLabel?: string;
  collapseShortcut?: ReactNode;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
}

function Side({
  edge,
  className,
  id,
  children,
  minWidth,
  maxWidth,
  defaultWidth,
  width,
  resizable = true,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...props
}: SideProps & {
  edge: WindowSide;
  minWidth: number;
  maxWidth: number;
}) {
  const open = useWindow().state[edge];
  const fallbackId = useId();
  const paneId = id ?? fallbackId;
  return (
    <aside
      className={cn(styles.side, className)}
      id={paneId}
      data-slot={edge}
      data-open={open || undefined}
      {...props}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      <div className={styles.grid}>{children}</div>
      {open && resizable ? (
        <Handle
          edge={edge}
          controls={paneId}
          minWidth={minWidth}
          maxWidth={maxWidth}
          defaultWidth={defaultWidth}
          width={width}
          resizeLabel={resizeLabel}
          collapseShortcut={collapseShortcut}
          onResize={onResize}
          onCollapse={onCollapse}
        />
      ) : null}
    </aside>
  );
}

function Left({ minWidth = 180, maxWidth = 420, ...props }: SideProps) {
  return (
    <Side edge="left" minWidth={minWidth} maxWidth={maxWidth} {...props} />
  );
}

function Right({ minWidth = 280, maxWidth = 560, ...props }: SideProps) {
  return (
    <Side edge="right" minWidth={minWidth} maxWidth={maxWidth} {...props} />
  );
}

/** Publishes its width on the root so Leading spans it along with the sidebar. */
function Rail({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const root = element?.closest<HTMLElement>('[data-slot="window"]');
    if (!element || !root) {
      return;
    }
    const write = () =>
      root.style.setProperty("--window-rail-width", `${element.offsetWidth}px`);
    const resize = new ResizeObserver(write);
    resize.observe(element);
    write();
    return () => {
      resize.disconnect();
      root.style.removeProperty("--window-rail-width");
    };
  }, []);
  return (
    <div
      ref={ref}
      className={cn(styles.rail, className)}
      data-slot="rail"
      {...props}
    />
  );
}

function Center({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(styles.center, styles.grid, className)}
      data-slot="center"
      tabIndex={-1}
      {...props}
    />
  );
}

interface HandleProps {
  edge: WindowSide;
  controls: string;
  minWidth: number;
  maxWidth: number;
  defaultWidth?: number;
  width?: number;
  resizeLabel?: string;
  collapseShortcut?: ReactNode;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
}

function Handle({
  edge,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...options
}: HandleProps) {
  const handle = (
    <HandleRoot
      {...options}
      edge={edge}
      className={styles.handle}
      aria-label={
        resizeLabel ?? (edge === "left" ? "Resize Sidebar" : "Resize Panel")
      }
      onWidthChange={onResize}
      onCollapse={onCollapse}
    />
  );
  if (!onCollapse) {
    return handle;
  }
  return (
    <Tooltip
      label={Tooltip.Label("Click to collapse", collapseShortcut)}
      side={edge === "left" ? "right" : "left"}
      delay={400}
      trackCursorAxis="y"
    >
      {handle}
    </Tooltip>
  );
}

/** Takes a `ref`, so a page can portal its own controls into the row. */
type PartProps = ComponentProps<"div">;

function Bar({ className, ...props }: PartProps) {
  return (
    <div className={cn(styles.bar, className)} data-slot="bar" {...props} />
  );
}

function Header({ className, ...props }: PartProps) {
  return (
    <div
      className={cn(styles.header, className)}
      data-slot="header"
      {...props}
    />
  );
}

function Body({ className, ...props }: PartProps) {
  return (
    <div className={cn(styles.body, className)} data-slot="body" {...props} />
  );
}

export const Window = {
  Root,
  Toolbar,
  Leading,
  Trailing,
  Rail,
  Panes,
  Left,
  Center,
  Right,
  Bar,
  Header,
  Body,
};
export { useWindow, type WindowContextValue } from "./context";
export type { WindowSide } from "./handle";
