import {
  IconBadgeCheck,
  IconEye2,
  IconHistory,
  IconSidebarEdit,
} from "@pond/icons";
import {
  isLockedSidebarDestination,
  type SidebarBadgeStyle,
  type SidebarDestination,
} from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import { type ReactElement, useState } from "react";
import { clearRecents, useRecents } from "@/features/saves";
import { SidebarCustomizationDialog } from "@/features/settings";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { usePrefs } from "@/shared/state/prefs";

const BADGE_STYLES: readonly [SidebarBadgeStyle, string][] = [
  ["count", "Count"],
  ["none", "None"],
];

export function BuiltInVisibilityMenu({
  children,
  destination,
  additionalItems,
}: {
  children: ReactElement;
  destination?: SidebarDestination;
  additionalItems?: () => MenuItemSpec[];
}) {
  const [sidebar, patch] = usePrefs("sidebar");
  const recents = useRecents();
  const [customizing, setCustomizing] = useState(false);
  /** Every destination row hosts this menu; the dialog mounts closed when the menu first opens so its entry transition still runs. */
  const [dialogMounted, setDialogMounted] = useState(false);

  const setBadgeStyle = (style: SidebarBadgeStyle | "default") => {
    if (!destination) return;
    const badgeOverrides = { ...sidebar.badgeOverrides };
    if (style === "default") delete badgeOverrides[destination];
    else badgeOverrides[destination] = style;
    void patch({ badgeOverrides });
  };

  const buildVisibilityItems = (
    destination: SidebarDestination,
  ): MenuItemSpec[] => {
    if (isLockedSidebarDestination(destination)) return [];
    const setVisible = (visible: boolean) =>
      void patch({
        destinations: { ...sidebar.destinations, [destination]: visible },
      });
    return [
      {
        type: "submenu",
        label: "Visibility",
        icon: <IconEye2 />,
        items: [
          {
            type: "checkbox",
            indicator: "check",
            label: "Always Show",
            checked: sidebar.destinations[destination],
            onCheckedChange: () => setVisible(true),
          },
          {
            type: "checkbox",
            indicator: "check",
            label: "Hide",
            checked: !sidebar.destinations[destination],
            onCheckedChange: () => setVisible(false),
          },
        ],
      },
    ];
  };

  const buildItems = (): MenuItemSpec[] => {
    const visibilityItems: MenuItemSpec[] = destination
      ? [
          ...buildVisibilityItems(destination),
          {
            type: "submenu",
            label: "Badge",
            icon: <IconBadgeCheck />,
            items: [
              {
                type: "checkbox",
                indicator: "check",
                label: "Use Default",
                checked: sidebar.badgeOverrides[destination] === undefined,
                onCheckedChange: () => setBadgeStyle("default"),
              },
              ...BADGE_STYLES.map(([style, label]) => ({
                type: "checkbox" as const,
                indicator: "check" as const,
                label,
                checked: sidebar.badgeOverrides[destination] === style,
                onCheckedChange: () => setBadgeStyle(style),
              })),
            ],
          },
        ]
      : [];

    return [
      ...visibilityItems,
      ...(visibilityItems.length > 0 ? [{ type: "separator" as const }] : []),
      {
        label: "Customize Sidebar",
        icon: <IconSidebarEdit />,
        onClick: () => setCustomizing(true),
      },
      ...(destination === "recentlyUsed"
        ? [
            { type: "separator" as const },
            {
              label: "Clear History",
              icon: <IconHistory />,
              disabled: recents.length === 0,
              onClick: clearRecents,
            },
          ]
        : []),
      ...(additionalItems
        ? [{ type: "separator" as const }, ...additionalItems()]
        : []),
    ];
  };

  return (
    <>
      <SpecContextMenu
        buildItems={buildItems}
        onOpen={() => setDialogMounted(true)}
      >
        {children}
      </SpecContextMenu>
      {dialogMounted ? (
        <SidebarCustomizationDialog
          open={customizing}
          onOpenChange={setCustomizing}
        />
      ) : null}
    </>
  );
}
