import { IconEyeSlash, IconSidebarEdit } from "@pond/icons";
import type { SidebarSection } from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import {
  SIDEBAR_SECTION_LABELS,
  setSidebarSectionVisible,
} from "@/features/settings/lib/sidebar-customization";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import type { SpecMenuChromeProps } from "@/shared/components/spec-context-menu";
import { SidebarCustomizationDialog } from "../sidebar-customization-dialog";

interface SidebarSectionMenuProps extends SpecMenuChromeProps {
  section: SidebarSection;
}

export function SidebarSectionMenu({
  section,
  buildItems,
  ...props
}: SidebarSectionMenuProps) {
  const [customizing, setCustomizing] = useState(false);

  const items = (): Array<MenuItemSpec> => [
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
  ];

  return (
    <>
      <SpecContextMenu buildItems={items} {...props} />
      <SidebarCustomizationDialog
        open={customizing}
        onOpenChange={setCustomizing}
      />
    </>
  );
}
