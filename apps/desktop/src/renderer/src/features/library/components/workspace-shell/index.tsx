import { cn, cssVars, Window } from "@pond/ui";
import { type ReactNode, useEffect, useState } from "react";
import {
  DETAILS_WIDTH_DEFAULT,
  DETAILS_WIDTH_MAX,
  DETAILS_WIDTH_MIN,
  libraryChrome,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useDetailsOpen,
  useDetailsWidth,
  useSidebarOpen,
  useSidebarWidth,
} from "@/features/library/state/library-chrome";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

interface RootProps {
  header: ReactNode;
  children: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  rightOpen?: boolean;
  className?: string;
}

/** Entering or leaving a save snaps Details so the content mounts at its final width instead of reflowing through the resize. */
function useInstantRouteChange(rightActive: boolean) {
  const [previous, setPrevious] = useState(rightActive);
  const [instant, setInstant] = useState(false);
  if (previous !== rightActive) {
    setPrevious(rightActive);
    setInstant(true);
  }

  useEffect(() => {
    if (!instant) return;
    const id = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(id);
  }, [instant]);

  return instant;
}

function Root({
  header,
  children,
  left,
  right,
  rightOpen: rightActive = Boolean(right),
  className,
}: RootProps) {
  const sidebarWidth = useSidebarWidth();
  const sidebarOpen = useSidebarOpen();
  const detailsWidth = useDetailsWidth();
  const detailsOpen = useDetailsOpen();
  const leftOpen = sidebarOpen && Boolean(left);
  const rightOpen = detailsOpen && rightActive && Boolean(right);
  const instant = useInstantRouteChange(rightActive);

  return (
    <Window.Root
      className={cn(styles.shell, className)}
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      data-instant={instant || undefined}
      style={cssVars({
        "--window-left-track": `${sidebarWidth}px`,
        "--window-right-track": `${detailsWidth}px`,
      })}
    >
      <Window.Left
        aria-label="Sidebar"
        open={leftOpen}
        minWidth={SIDEBAR_WIDTH_MIN}
        maxWidth={SIDEBAR_WIDTH_MAX}
        defaultWidth={SIDEBAR_WIDTH_DEFAULT}
        width={sidebarWidth}
        collapseShortcut={<ShortcutKeys id="view.sidebar" />}
        onResize={libraryChrome.setSidebarWidth}
        onCollapse={libraryChrome.toggleSidebar}
      >
        {left}
      </Window.Left>
      <Window.Top>{header}</Window.Top>
      <Window.Center>{children}</Window.Center>
      <Window.Right
        aria-label="Details"
        open={rightOpen}
        minWidth={DETAILS_WIDTH_MIN}
        maxWidth={DETAILS_WIDTH_MAX}
        defaultWidth={DETAILS_WIDTH_DEFAULT}
        width={detailsWidth}
        resizeLabel="Resize Details"
        collapseShortcut={<ShortcutKeys id="view.inspector" />}
        onResize={libraryChrome.setDetailsWidth}
        onCollapse={() => libraryChrome.setDetailsOpen(false)}
      >
        {right}
      </Window.Right>
    </Window.Root>
  );
}

interface ToolbarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Toolbar({ className, ...props }: ToolbarProps) {
  return <div className={cn(styles.toolbar, className)} {...props} />;
}

interface ContentProps extends React.ComponentPropsWithoutRef<"div"> {}

function Content({ className, ...props }: ContentProps) {
  return <div className={cn(styles.content, className)} {...props} />;
}

export const AppShell = { Root, Toolbar, Content };
