import { IconDots, IconEnvelope, IconTrash } from "@pond/icons";
import {
  Menu,
  type MenuItemSpec,
  Sidebar,
  Tabs,
  Toggle,
  Tooltip,
} from "@pond/ui";
import { createElement } from "react";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import {
  type InboxScope,
  type InboxView,
  inboxPicker,
  useInboxView,
} from "@/features/library/state/inbox-review";
import {
  isSnoozed,
  isUnread,
  notifications,
  useNotifications,
} from "@/features/notifications";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { formatNumber } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import { InboxDisplayMenu } from "../display";
import styles from "./styles.module.css";

const TABS: readonly { value: InboxView; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "other", label: "Other" },
];

const UNREAD_ONLY = "Show Unreads Only";

function moreItems(): MenuItemSpec[] {
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

function useTabCounts(scope: InboxScope): Record<InboxView, number> {
  const counts = useSidebarCounts();
  const items = useNotifications();
  let priority = scope === "snoozed" ? counts.inboxSnoozed : counts.inbox;
  let other = 0;
  for (const item of items) {
    if (isSnoozed(item) !== (scope === "snoozed") || !isUnread(item)) continue;
    if (item.priority) priority += 1;
    else other += 1;
  }
  return { priority, other };
}

function ViewTabs({ scope }: { scope: InboxScope }) {
  const view = useInboxView();
  const counts = useTabCounts(scope);
  return (
    <Tabs.Root
      className={styles.tabs}
      value={view}
      onValueChange={(next: InboxView) => {
        inboxPicker.select(null);
        inboxPicker.setView(next);
      }}
    >
      <Tabs.List aria-label="Inbox Views">
        {TABS.map((tab) => (
          <Tabs.Tab key={tab.value} value={tab.value}>
            {tab.label}
            <span className={styles.count}>
              {formatNumber(counts[tab.value])}
            </span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function InboxHeader({ scope }: { scope: InboxScope }) {
  const [display, patch] = usePrefs("inboxDisplay");
  const label = scope === "snoozed" ? "Snoozed" : "Inbox";

  return (
    <>
      <Sidebar.GroupHeader>
        <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
        <SpecMenu align="end" buildItems={moreItems}>
          <Menu.Trigger
            icon
            size="xs"
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
      {display.priorityInbox ? <ViewTabs scope={scope} /> : null}
    </>
  );
}
