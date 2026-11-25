import { IconDots, IconEnvelope, IconTrash } from "@pond/icons";
import { Menu, Sidebar, Toggle, Tooltip } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import type { InboxScope } from "@/features/library/state/inbox-review";
import { notifications } from "@/features/notifications";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { usePrefs } from "@/shared/state/prefs";
import { InboxDisplayMenu } from "../display";

const UNREAD_ONLY = "Show Unreads Only";

function moreItems(): Array<MenuItemSpec> {
  return [
    {
      label: "Mark All as Read",
      icon: createElement(IconEnvelope),
      onClick: () => notifications.markAllRead(),
    },
    {
      label: "Delete Read Notifications",
      icon: createElement(IconTrash),
      variant: "destructive",
      onClick: () => notifications.removeRead(),
    },
  ];
}

export function InboxHeader({ scope }: { scope: InboxScope }) {
  const [display, patch] = usePrefs("inboxDisplay");
  const label = scope === "snoozed" ? "Snoozed" : "Inbox";

  return (
    <Sidebar.GroupHeader>
      <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
      <SpecMenu align="end" buildItems={moreItems}>
        <Menu.Trigger
          icon
          size="sm"
          variant="ghost"
          aria-label="More Inbox Actions"
        >
          <IconDots size={12} />
        </Menu.Trigger>
      </SpecMenu>
      <Tooltip label={UNREAD_ONLY} side="bottom">
        <Toggle
          icon
          size="sm"
          variant="ghost"
          pressed={display.unreadOnly}
          onPressedChange={(unreadOnly) => void patch({ unreadOnly })}
          aria-label={UNREAD_ONLY}
        >
          <IconEnvelope size={12} />
        </Toggle>
      </Tooltip>
      <InboxDisplayMenu scope={scope} />
    </Sidebar.GroupHeader>
  );
}
