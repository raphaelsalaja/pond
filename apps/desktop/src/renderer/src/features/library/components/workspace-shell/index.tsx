import { cn, cssVars, Window } from "@pond/ui";
import {
  type ComponentPropsWithoutRef,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
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
import { useShellLayout } from "@/features/library/state/shell-layout";
import type { ShellDetails } from "@/features/library/state/shell-layout";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

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
    if (!instant) {
      return;
    }
    const id = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(id);
  }, [instant]);

  return instant;
}

type RootProps = ComponentPropsWithoutRef<"div">;

function Root({ className, style, ...props }: RootProps) {
  const layout = useShellLayout();
  /** Commits with the grid's deferred repack, so the slide starts after that render instead of stalling on it. */
  const details = useDeferredValue(layout.details);
  const railOnly = useDeferredValue(layout.railOnly);
  const sidebarHidden = useDeferredValue(layout.sidebarHidden);
  const leftOpen = useDeferredValue(layout.leftOpen);
  const rightOpen = useDeferredValue(layout.rightOpen);
  const sidebarWidth = useSidebarWidth();
  const detailsWidth = useDetailsWidth();
  const instant = useInstantOnChange(details, railOnly, sidebarHidden);

  return (
    <Window.Root
      className={cn(styles.shell, className)}
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      instant={instant}
      surface="island"
      style={{
        ...cssVars({
          "--window-left-track": `${sidebarWidth}px`,
          "--window-right-track": `${detailsWidth}px`,
        }),
        ...style,
      }}
      {...props}
    />
  );
}

interface RailProps extends ComponentPropsWithoutRef<"div"> {}

function Rail(props: RailProps) {
  const { sidebarHidden } = useShellLayout();
  if (sidebarHidden) return null;
  return <Window.Rail {...props} />;
}

interface ColumnProps extends ComponentPropsWithoutRef<"aside"> {}

function Sidebar(props: ColumnProps) {
  const width = useSidebarWidth();
  return (
    <Window.Left
      aria-label="Sidebar"
      minWidth={SIDEBAR_WIDTH_MIN}
      maxWidth={SIDEBAR_WIDTH_MAX}
      defaultWidth={SIDEBAR_WIDTH_DEFAULT}
      width={width}
      collapseShortcut={<ShortcutKeys id="view.sidebar" />}
      onResize={(next) => libraryChrome.setSidebarWidth(next)}
      onCollapse={() => libraryChrome.toggleSidebar()}
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
      onResize={(next) => libraryChrome.setDetailsWidth(next)}
      onCollapse={() => libraryChrome.setDetailsOpen(false)}
      {...props}
    />
  );
}

type ContentProps = ComponentPropsWithoutRef<"div">;

function Content({ className, ...props }: ContentProps) {
  return <div className={cn(styles.content, className)} {...props} />;
}

export const AppShell = { Root, Rail, Sidebar, Details, Content };
