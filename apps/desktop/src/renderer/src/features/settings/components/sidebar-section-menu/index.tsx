import { IconEyeSlash, IconSidebarEdit } from "@pond/icons";
import type { SidebarSection } from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import {
  SIDEBAR_SECTION_LABELS,
  setSidebarSectionVisible,
} from "@/features/settings/lib/sidebar-customization";
import {
  SpecContextMenu,
  SpecMoreMenu,
} from "@/shared/components/spec-context-menu";
import type { SpecMenuChromeProps } from "@/shared/components/spec-context-menu";
import { SidebarCustomizationDialog } from "../sidebar-customization-dialog";

interface SidebarSectionMenuProps extends SpecMenuChromeProps {
  section: SidebarSection;
}

function useSectionMenu(
  section: SidebarSection,
  buildItems: () => Array<MenuItemSpec>,
) {
  const [customizing, setCustomizing] = useState(false);

  return {
    items: (): Array<MenuItemSpec> => [
      ...buildItems(),
      { type: "separator" },
      {
        label: `Hide ${SIDEBAR_SECTION_LABELS[section]}`,
        icon: <IconEyeSlash />,
        onClick: () => setSidebarSectionVisible(section, false),
      },
      {
        label: "Customize Sidebar",
        icon: <IconSidebarEdit />,
        onClick: () => setCustomizing(true),
      },
    ],
    dialog: (
      <SidebarCustomizationDialog
        open={customizing}
        onOpenChange={setCustomizing}
      />
    ),
  };
}

export function SidebarSectionMenu({
  section,
  buildItems,
  ...props
}: SidebarSectionMenuProps) {
  const { items, dialog } = useSectionMenu(section, buildItems);

  return (
    <>
      <SpecContextMenu buildItems={items} {...props} />
      {dialog}
    </>
  );
}

/** The section header's ⋯ button, holding the same items as its right-click menu. */
export function SidebarSectionMoreMenu({
  section,
  label,
  buildItems,
}: {
  section: SidebarSection;
  label: string;
  buildItems: () => Array<MenuItemSpec>;
}) {
  const { items, dialog } = useSectionMenu(section, buildItems);

  return (
    <>
      <SpecMoreMenu label={label} buildItems={items} />
      {dialog}
    </>
  );
}
