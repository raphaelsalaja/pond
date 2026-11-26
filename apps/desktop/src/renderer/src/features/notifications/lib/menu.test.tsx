import type { MenuItemSpec } from "@pond/ui";
import type { InboxNotification } from "@shared/notification-contracts";
import { describe, expect, it, vi } from "vitest";
import { topLevelMenuLabels as labels } from "@/shared/test/menu-labels";
import { bridge } from "@/shared/test/pond-bridge";
import { buildNotificationMenuItems } from "./menu";

function notification(
  overrides: Partial<InboxNotification> = {},
): InboxNotification {
  return {
    id: "n1",
    kind: "attention",
    priority: true,
    title: "Instagram signed out",
    body: "Sign in again to keep syncing.",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function click(items: ReadonlyArray<MenuItemSpec>, label: string): void {
  const item = items.find((entry) => "label" in entry && entry.label === label);
  if (item && "onClick" in item) item.onClick?.();
}

describe("Notification menu", () => {
  it("offers the detail pane's actions, led by the target", () => {
    expect(
      labels(
        buildNotificationMenuItems(
          notification({ target: { type: "settings", section: "sources" } }),
          () => {},
        ),
      ),
    ).toEqual([
      "Open Settings",
      "Mark Read",
      "Snooze",
      "Copy Message",
      "Delete",
    ]);
    expect(
      labels(buildNotificationMenuItems(notification({ readAt: 2 }), () => {})),
    ).toEqual(["Mark Unread", "Snooze", "Copy Message", "Delete"]);
  });

  it("copies the title and body", () => {
    bridge.use({
      query: {
        "clipboard.writeText": () => ({ ok: true }),
        "notifications.delete": () => ({ ok: true }),
      },
    });
    click(
      buildNotificationMenuItems(notification(), () => {}),
      "Copy Message",
    );
    expect(window.pond.query).toHaveBeenCalledWith("clipboard.writeText", {
      text: "Instagram signed out\n\nSign in again to keep syncing.",
    });
  });

  it("moves the selection off before deleting", () => {
    bridge.use({ query: { "notifications.delete": () => ({ ok: true }) } });
    const leave = vi.fn();
    click(buildNotificationMenuItems(notification(), leave), "Delete");
    expect(leave).toHaveBeenCalledOnce();
    expect(window.pond.query).toHaveBeenCalledWith("notifications.delete", {
      ids: ["n1"],
    });
  });
});
