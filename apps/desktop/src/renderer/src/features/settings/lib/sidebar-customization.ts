import type {
  Prefs,
  SidebarBadgeStyle,
  SidebarDestination,
  SidebarSection,
} from "@pond/schema";
import { useEffect } from "react";
import { getPrefsSnapshot, patchPrefsSection } from "@/shared/state/prefs";

export const SIDEBAR_SECTION_LABELS = {
  smartFolders: "Smart Folders",
  fish: "Fish",
  canvases: "Canvases",
  folders: "Folders",
} as const satisfies Record<SidebarSection, string>;

export function setSidebarSectionVisible(
  section: SidebarSection,
  visible: boolean,
): void {
  const sections = getPrefsSnapshot()?.sidebar.sections;
  if (!sections || sections[section] === visible) return;
  void patchPrefsSection("sidebar", {
    sections: { ...sections, [section]: visible },
  });
}

/** Inline rename needs its row on screen, so naming a new item brings a hidden section back. */
export function useRevealSidebarSection(
  section: SidebarSection,
  editing: boolean,
): void {
  useEffect(() => {
    if (editing) setSidebarSectionVisible(section, true);
  }, [section, editing]);
}

export const SIDEBAR_DESTINATION_GROUPS = [
  {
    label: "Library",
    heading: false,
    destinations: [
      "all",
      "uncategorized",
      "untagged",
      "recentlyAdded",
      "recentlyUsed",
      "tags",
      "random",
      "splitPosts",
      "trash",
    ],
  },
  {
    label: "Harvesting",
    heading: true,
    destinations: ["sources", "downloads"],
  },
] as const satisfies readonly {
  label: string;
  heading: boolean;
  destinations: readonly SidebarDestination[];
}[];

export const SIDEBAR_DESTINATION_LABELS = {
  all: "All",
  uncategorized: "Uncategorized",
  untagged: "Untagged",
  recentlyAdded: "Recently Added",
  recentlyUsed: "Recently Used",
  tags: "Tags",
  random: "Random",
  splitPosts: "Split Posts",
  trash: "Trash",
  downloads: "Downloads",
  sources: "Sources",
} as const satisfies Record<SidebarDestination, string>;

export function moveVisibleSidebarDestination(
  order: readonly SidebarDestination[],
  group: readonly SidebarDestination[],
  visible: readonly SidebarDestination[],
  destination: SidebarDestination,
  over: SidebarDestination,
): SidebarDestination[] {
  const visibleOrder = order.filter(
    (item) => group.includes(item) && visible.includes(item),
  );
  const sourceIndex = visibleOrder.indexOf(destination);
  const targetIndex = visibleOrder.indexOf(over);
  if (sourceIndex < 0 || targetIndex < 0) return [...order];
  visibleOrder.splice(sourceIndex, 1);
  visibleOrder.splice(targetIndex, 0, destination);

  let visibleIndex = 0;
  return order.map((item) =>
    group.includes(item) && visible.includes(item)
      ? (visibleOrder[visibleIndex++] ?? item)
      : item,
  );
}

export function resolveSidebarBadgeStyle(
  sidebar: Prefs["sidebar"],
  destination?: SidebarDestination,
): SidebarBadgeStyle {
  if (destination) {
    const override = sidebar.badgeOverrides[destination];
    if (override) return override;
  }
  return sidebar.badgeStyle;
}
