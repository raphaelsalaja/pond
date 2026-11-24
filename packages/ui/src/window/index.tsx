import { createParts } from "@ui-sdk/react/primitive";
import { clsx as cn } from "clsx";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
  RefObject,
} from "react";
import { isHTMLElement } from "../dom";
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
  /** `rounded` has the center draw the corner, for a left column with no panel of its own to carry it. */
  leftEdge?: "divider" | "rounded";
}

function Root({
  className,
  children,
  leftOpen = false,
  rightOpen = false,
  instant = false,
  leftEdge = "divider",
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
        data-left-edge={leftEdge === "rounded" ? leftEdge : undefined}
        {...props}
      >
        {children}
      </div>
    </WindowContext>
  );
}

/** Sums padding, gaps and children, since the element itself stretches to the column under it. */
function naturalWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const children = [...element.children].filter((child): child is HTMLElement =>
    isHTMLElement(child),
  );
  const gap = Number.parseFloat(style.columnGap) || 0;
  let width =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0) +
    gap * Math.max(0, children.length - 1);
  for (const child of children) {
    width += child.getBoundingClientRect().width;
  }
  return Math.ceil(width);
}

/** Publishes a pinned control cluster's width on the root so the center bar starts after it. */
function useNaturalWidth(
  ref: RefObject<HTMLElement | null>,
  property: "--window-leading-width" | "--window-trailing-width",
) {
  useLayoutEffect(() => {
    const element = ref.current;
    const root = element?.closest<HTMLElement>('[data-slot="window"]');
    if (!element || !root) {
      return;
    }
    let last = "";
    const write = () => {
      const next = `${naturalWidth(element)}px`;
      if (next === last) {
        return;
      }
      last = next;
      root.style.setProperty(property, next);
    };
    const resize = new ResizeObserver(write);
    const observe = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) {
        resize.observe(child);
      }
      write();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(element, { childList: true });
    observe();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      root.style.removeProperty(property);
    };
  }, [ref, property]);
}

type ClusterProps = ComponentPropsWithoutRef<"div">;

function Leading({ className, ...props }: ClusterProps) {
  const ref = useRef<HTMLDivElement>(null);
  useNaturalWidth(ref, "--window-leading-width");
  return (
    <div
      ref={ref}
      className={cn(styles.leading, className)}
      data-slot="leading"
      {...props}
    />
  );
}

function Trailing({ className, ...props }: ClusterProps) {
  const ref = useRef<HTMLDivElement>(null);
  useNaturalWidth(ref, "--window-trailing-width");
  return (
    <div
      ref={ref}
      className={cn(styles.trailing, className)}
      data-slot="trailing"
      {...props}
    />
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
  Leading,
  Trailing,
  Left,
  Center,
  Right,
  Bar,
  Header,
  Body,
};
export { useWindow, type WindowContextValue } from "./context";
export type { WindowSide } from "./handle";
