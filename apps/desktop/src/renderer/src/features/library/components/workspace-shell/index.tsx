import { cn, cssVars, Window } from "@pond/ui";
import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import {
  DETAILS_WIDTH_DEFAULT,
  DETAILS_WIDTH_MAX,
  DETAILS_WIDTH_MIN,
  libraryChrome,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useDetailsWidth,
  useSidebarWidth,
} from "@/features/library/state/library-chrome";
import {
  type ShellDetails,
  useShellLayout,
} from "@/features/library/state/shell-layout";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

/** The rail's own width: one rail button plus its padding. */
const RAIL_TRACK = "calc(var(--ds-size-md) + var(--ds-space-md) * 2)";

/** A route that swaps or removes a column snaps it, so the new page mounts at its final width instead of reflowing through the push. */
function useInstantOnChange(
  details: ShellDetails | null,
  railOnly: boolean,
  sidebarHidden: boolean,
) {
  const layout = `${details}:${railOnly}:${sidebarHidden}`;
  const [previous, setPrevious] = useState(layout);
  const [instant, setInstant] = useState(false);
  if (previous !== layout) {
    setPrevious(layout);
    setInstant(true);
  }

  useEffect(() => {
    if (!instant) return;
    const id = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(id);
  }, [instant]);

  return instant;
}

interface RootProps extends ComponentPropsWithoutRef<"div"> {}

function Root({ className, style, ...props }: RootProps) {
  const { details, railOnly, sidebarHidden, leftOpen, rightOpen } =
    useShellLayout();
  const sidebarWidth = useSidebarWidth();
  const detailsWidth = useDetailsWidth();
  const instant = useInstantOnChange(details, railOnly, sidebarHidden);

  return (
    <Window.Root
      className={cn(styles.shell, className)}
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      instant={instant}
      leftEdge={railOnly ? "rounded" : "divider"}
      style={{
        ...cssVars({
          "--window-left-track": railOnly ? RAIL_TRACK : `${sidebarWidth}px`,
          "--window-right-track": `${detailsWidth}px`,
        }),
        ...style,
      }}
      {...props}
    />
  );
}

interface ColumnProps extends ComponentPropsWithoutRef<"aside"> {}

function Sidebar(props: ColumnProps) {
  const width = useSidebarWidth();
  const { railOnly } = useShellLayout();
  return (
    <Window.Left
      aria-label="Sidebar"
      minWidth={SIDEBAR_WIDTH_MIN}
      maxWidth={SIDEBAR_WIDTH_MAX}
      defaultWidth={SIDEBAR_WIDTH_DEFAULT}
      width={width}
      resizable={!railOnly}
      collapseShortcut={<ShortcutKeys id="view.sidebar" />}
      onResize={libraryChrome.setSidebarWidth}
      onCollapse={libraryChrome.toggleSidebar}
      {...props}
    />
  );
}

function Details(props: ColumnProps) {
  const width = useDetailsWidth();
  return (
    <Window.Right
      aria-label="Details"
      minWidth={DETAILS_WIDTH_MIN}
      maxWidth={DETAILS_WIDTH_MAX}
      defaultWidth={DETAILS_WIDTH_DEFAULT}
      width={width}
      resizeLabel="Resize Details"
      collapseShortcut={<ShortcutKeys id="view.inspector" />}
      onResize={libraryChrome.setDetailsWidth}
      onCollapse={() => libraryChrome.setDetailsOpen(false)}
      {...props}
    />
  );
}

interface ContentProps extends ComponentPropsWithoutRef<"div"> {}

function Content({ className, ...props }: ContentProps) {
  return <div className={cn(styles.content, className)} {...props} />;
}

export const AppShell = { Root, Sidebar, Details, Content };
