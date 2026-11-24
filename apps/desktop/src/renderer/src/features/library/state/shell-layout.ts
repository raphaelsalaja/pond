import {
  useDetailsOpen,
  useSidebarOpen,
} from "@/features/library/state/library-chrome";
import {
  type RailPage,
  type ShellDetails,
  useLatestRouteMeta,
  useRouteMeta,
} from "@/shared/lib/route-meta";

export type { RailPage, ShellDetails } from "@/shared/lib/route-meta";

/** Reads the latest location, so the Sidebar narrows with the URL instead of after a code-split route loads. */
export function useRailOnlySidebar(): boolean {
  return useLatestRouteMeta().railOnly;
}

export function useHiddenSidebar(): boolean {
  return useLatestRouteMeta().sidebarHidden;
}

export function useShellDetails(): ShellDetails | null {
  return useRouteMeta().details;
}

export function useRailPage(): RailPage | null {
  return useRouteMeta().railPage;
}

export interface ShellLayout {
  details: ShellDetails | null;
  railOnly: boolean;
  sidebarHidden: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
}

export function useShellLayout(): ShellLayout {
  const details = useShellDetails();
  const railOnly = useRailOnlySidebar();
  const sidebarHidden = useHiddenSidebar();
  const sidebarOpen = useSidebarOpen();
  const detailsOpen = useDetailsOpen();
  return {
    details,
    railOnly,
    sidebarHidden,
    leftOpen: sidebarOpen && !sidebarHidden,
    rightOpen: detailsOpen && details !== null,
  };
}
