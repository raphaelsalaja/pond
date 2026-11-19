import { IconCalendar, IconCalendarCheck, IconCalendarDate } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { recentlyAddedSince } from "@shared/recently-added";
import { filterToolbar } from "@/features/library/components/filter-menu/toolbar-state";
import {
  addLocalDays,
  formatLocalDay,
  localDayPredicate,
} from "@/features/library/lib/local-day";
import { setQuery } from "@/features/library/state/view-store";
import { selectLibraryNav } from "./navigation";

/** First and last local days that overlap Recently Added's rolling window. */
export function recentlyAddedDays(now = new Date()): {
  min: string;
  max: string;
} {
  return {
    min: formatLocalDay(new Date(recentlyAddedSince(now.getTime()))),
    max: formatLocalDay(now),
  };
}

export function showRecentlyAddedOn(day: Date, now = new Date()): void {
  selectLibraryNav({ kind: "recentlyAdded" });
  setQuery({
    combinator: "and",
    rules: [localDayPredicate("savedAt", day, now)],
  });
  filterToolbar.setOpen(true);
}

export function buildRecentlyAddedMenuItems({
  hasItems,
  onChooseDate,
}: {
  hasItems: boolean;
  onChooseDate: () => void;
}): MenuItemSpec[] {
  return [
    {
      label: "Added Today",
      icon: <IconCalendarCheck />,
      disabled: !hasItems,
      onClick: () => showRecentlyAddedOn(new Date()),
    },
    {
      label: "Added Yesterday",
      icon: <IconCalendarDate />,
      disabled: !hasItems,
      onClick: () => showRecentlyAddedOn(addLocalDays(new Date(), -1)),
    },
    {
      label: "Choose Date",
      icon: <IconCalendar />,
      disabled: !hasItems,
      onClick: onChooseDate,
    },
  ];
}
