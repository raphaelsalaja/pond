import {
  IconCalendar,
  IconCircleCheck,
  IconCircleDashedClock,
  IconInbox,
  IconInboxMinus,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import {
  addToInbox,
  isWaitingInInbox,
  markProcessed,
  removeFromInbox,
  snoozeSaves,
} from "@/features/saves/lib/inbox-actions";
import { snoozeOptions } from "@/features/saves/lib/snooze";
import { openSnoozeDialog } from "@/features/saves/state/snooze-dialog";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

export function buildSnoozeItems(ids: readonly string[]): MenuItemSpec[] {
  return [
    ...snoozeOptions().map(
      (option): MenuItemSpec => ({
        label: option.label,
        icon: glyph(IconCircleDashedClock),
        onClick: () => void snoozeSaves(ids, option.until),
      }),
    ),
    { type: "separator" },
    {
      label: "Choose Date and Time",
      icon: glyph(IconCalendar),
      shortcut: shortcutGlyphs("save.snooze"),
      onClick: () => openSnoozeDialog(ids),
    },
  ];
}

/** Only Saves already in the Inbox offer processing and snoozing; everything else offers a way in. */
export function buildInboxItems({ saves }: SaveMenuContext): MenuItemSpec[] {
  const live = saves.filter((save) => !save.deletedAt);
  const waiting = live.filter(isWaitingInInbox).map((save) => save.id);
  const outside = live.filter((save) => save.inboxState !== "review");
  return [
    {
      label: "Mark Processed",
      icon: glyph(IconCircleCheck),
      shortcut: shortcutGlyphs("save.mark-processed"),
      hidden: waiting.length === 0,
      onClick: () => void markProcessed(waiting),
    },
    {
      type: "submenu",
      label: "Snooze",
      icon: glyph(IconCircleDashedClock),
      hidden: waiting.length === 0,
      items: buildSnoozeItems(waiting),
    },
    {
      label: outside.every((save) => save.inboxState === "snoozed")
        ? "Return to Inbox"
        : "Add to Inbox",
      icon: glyph(IconInbox),
      hidden: outside.length === 0,
      onClick: () => void addToInbox(outside.map((save) => save.id)),
    },
    {
      label: "Remove from Inbox",
      icon: glyph(IconInboxMinus),
      hidden: waiting.length === 0,
      onClick: () => void removeFromInbox(waiting),
    },
  ];
}
