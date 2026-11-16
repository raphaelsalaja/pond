import { createParts } from "@ui-sdk/react/primitive";
import { clsx as cn } from "clsx";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Tooltip } from "../tooltip";
import { useWindow, WindowContext, type WindowEdge } from "./context";
import { type WindowSide, windowHandle } from "./handle";
import styles from "./styles.module.css";

const { Root: HandleRoot } = createParts(windowHandle, { root: "div" });

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  leftOpen?: boolean;
  rightOpen?: boolean;
}

function Root({
  className,
  children,
  leftOpen,
  rightOpen,
  ...props
}: RootProps) {
  const [state, setState] = useState<Record<WindowEdge, boolean>>({
    top: false,
    left: false,
    right: false,
    bottom: false,
  });

  const setOpen = useCallback((edge: WindowEdge, open: boolean) => {
    setState((prev) =>
      prev[edge] === open ? prev : { ...prev, [edge]: open },
    );
  }, []);

  const resolvedState = useMemo(
    () => ({
      ...state,
      left: leftOpen ?? state.left,
      right: rightOpen ?? state.right,
    }),
    [state, leftOpen, rightOpen],
  );
  const actions = useMemo(() => ({ setOpen }), [setOpen]);
  const value = useMemo(
    () => ({
      state: resolvedState,
      actions,
      meta: {},
    }),
    [resolvedState, actions],
  );

  return (
    <WindowContext value={value}>
      <div
        className={cn(styles.root, className)}
        data-slot="window"
        data-top-open={resolvedState.top || undefined}
        data-left-open={resolvedState.left || undefined}
        data-right-open={resolvedState.right || undefined}
        data-bottom-open={resolvedState.bottom || undefined}
        {...props}
      >
        {children}
      </div>
    </WindowContext>
  );
}

function useEdgeOpen(edge: WindowEdge, open: boolean) {
  const {
    actions: { setOpen },
  } = useWindow();
  useLayoutEffect(() => {
    setOpen(edge, open);
    return () => {
      setOpen(edge, false);
    };
  }, [setOpen, edge, open]);
}

interface TopProps extends ComponentPropsWithoutRef<"header"> {
  open?: boolean;
}

function Top({ className, open = true, ...props }: TopProps) {
  useEdgeOpen("top", open);
  return (
    <header
      className={cn(styles.top, className)}
      data-slot="top"
      data-open={open || undefined}
      {...props}
    />
  );
}

interface SideProps extends ComponentPropsWithoutRef<"aside"> {
  /** Both panes are `aside` landmarks, so each needs its own name. */
  "aria-label": string;
  open?: boolean;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  width?: number;
  resizeLabel?: string;
  collapseShortcut?: ReactNode;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
}

function Left({
  className,
  id,
  open = true,
  children,
  minWidth = 180,
  maxWidth = 420,
  defaultWidth,
  width,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...props
}: SideProps) {
  useEdgeOpen("left", open);
  const fallbackId = useId();
  const paneId = id ?? fallbackId;
  return (
    <aside
      className={cn(styles.left, className)}
      id={paneId}
      data-slot="left"
      data-open={open || undefined}
      {...props}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      <div className={styles["edge-content"]}>{children}</div>
      {open ? (
        <Handle
          edge="left"
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

function Center({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(styles.center, className)}
      data-slot="center"
      tabIndex={-1}
      {...props}
    >
      {children}
    </div>
  );
}

function Right({
  className,
  id,
  open = true,
  children,
  minWidth = 280,
  maxWidth = 560,
  defaultWidth,
  width,
  resizeLabel,
  collapseShortcut,
  onResize,
  onCollapse,
  ...props
}: SideProps) {
  useEdgeOpen("right", open);
  const fallbackId = useId();
  const paneId = id ?? fallbackId;
  return (
    <aside
      className={cn(styles.right, className)}
      id={paneId}
      data-slot="right"
      data-open={open || undefined}
      {...props}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      <div className={styles["edge-content"]}>{children}</div>
      {open ? (
        <Handle
          edge="right"
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
  return (
    <Tooltip
      label={Tooltip.Label("Click to collapse", collapseShortcut)}
      side={edge === "left" ? "right" : "left"}
      delay={400}
      trackCursorAxis="y"
    >
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
    </Tooltip>
  );
}

interface BottomProps extends ComponentPropsWithoutRef<"footer"> {
  open?: boolean;
}

function Bottom({ className, open = true, ...props }: BottomProps) {
  useEdgeOpen("bottom", open);
  return (
    <footer
      className={cn(styles.bottom, className)}
      data-slot="bottom"
      data-open={open || undefined}
      {...props}
    />
  );
}

export const Window = { Root, Top, Left, Center, Right, Bottom };
export {
  useWindow,
  type WindowContextValue,
  type WindowEdge,
} from "./context";
