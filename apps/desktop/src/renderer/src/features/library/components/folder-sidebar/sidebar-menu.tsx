import {
  IconEye,
  IconFolder,
  IconFolderSearch,
  IconLayers,
  IconSidebarEdit,
} from "@pond/icons";
import {
  isLockedSidebarDestination,
  SIDEBAR_DESTINATIONS,
  SIDEBAR_SECTIONS,
} from "@pond/schema";
import type { Prefs } from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import type { ReactElement } from "react";
import {
  newFolder,
  newSmartFolder,
} from "@/features/library/components/new-menu/actions";
import {
  SIDEBAR_DESTINATION_LABELS,
  SIDEBAR_SECTION_LABELS,
  SidebarCustomizationDialog,
} from "@/features/settings";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { usePrefs } from "@/shared/state/prefs";

type SidebarPrefs = Prefs["sidebar"];

export function sidebarMenuItems({
  sidebar,
  patch,
  customize,
}: {
  sidebar: SidebarPrefs;
  patch: (next: Partial<SidebarPrefs>) => void;
  customize: () => void;
}): Array<MenuItemSpec> {
  const hidden = SIDEBAR_DESTINATIONS.filter(
    (destination) =>
      !isLockedSidebarDestination(destination) &&
      !sidebar.destinations[destination],
  );
  const show = (destinations: ReadonlyArray<(typeof hidden)[number]>) =>
    patch({
      destinations: {
        ...sidebar.destinations,
        ...Object.fromEntries(destinations.map((item) => [item, true])),
      },
    });

  return [
    {
      label: "Customize Sidebar",
      icon: <IconSidebarEdit />,
      onClick: customize,
    },
    { type: "separator" },
    {
      type: "submenu",
      label: "Sections",
      icon: <IconLayers />,
      items: SIDEBAR_SECTIONS.map((section) => ({
        type: "checkbox",
        indicator: "check",
        label: SIDEBAR_SECTION_LABELS[section],
        checked: sidebar.sections[section],
        onCheckedChange: (checked) =>
          patch({ sections: { ...sidebar.sections, [section]: checked } }),
      })),
    },
    {
      type: "submenu",
      label: "Show Hidden",
      icon: <IconEye />,
      disabled: hidden.length === 0,
      items: [
        ...hidden.map((destination): MenuItemSpec => ({
          label: SIDEBAR_DESTINATION_LABELS[destination],
          onClick: () => show([destination]),
        })),
        ...(hidden.length > 1
          ? [
              { type: "separator" as const },
              { label: "Show All", onClick: () => show(hidden) },
            ]
          : []),
      ],
    },
    { type: "separator" },
    {
      label: "New Folder",
      icon: <IconFolder />,
      shortcut: shortcutGlyphs("library.new-folder"),
      onClick: () => void newFolder(),
    },
    {
      label: "New Smart Folder",
      icon: <IconFolderSearch />,
      onClick: newSmartFolder,
    },
  ];
}

/** Rows and section headers open their own menus first; this catches the space around them. */
export function SidebarMenu({ children }: { children: ReactElement }) {
  const [sidebar, patch] = usePrefs("sidebar");
  const [customizing, setCustomizing] = useState(false);

  return (
    <>
      <SpecContextMenu
        buildItems={() =>
          sidebarMenuItems({
            sidebar,
            patch: (next) => void patch(next),
            customize: () => setCustomizing(true),
          })
        }
      >
        {children}
      </SpecContextMenu>
      <SidebarCustomizationDialog
        open={customizing}
        onOpenChange={setCustomizing}
      />
    </>
  );
}
