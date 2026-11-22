import { useEffect, useRef } from "react";
import {
  type HealthCategory,
  useHealthSignal,
} from "@/features/settings/library-health";
import { formatPlural } from "@/shared/lib/format";
import {
  postNotification,
  resolveNotifications,
} from "@/shared/lib/notification-log";
import { useNotifications } from "../state/notifications";

/** Main posts the categories its stored check covers; these two change between checks. */
const LIVE = ["posters", "processing"] as const;

const NEED_ATTENTION = {
  one: "Save needs attention",
  other: "Saves need attention",
};

interface Seen {
  attention: number;
  progress: number;
}

function post(category: HealthCategory): void {
  postNotification({
    id: `health:${category.id}`,
    kind: "attention",
    priority: true,
    title: category.title,
    body: formatPlural(category.attention, NEED_ATTENTION),
    target: { type: "health", categoryId: category.id },
  });
}

/** Enrichment failures load after launch, so processing only resolves after a run settles or a failure clears. */
function cleared(category: HealthCategory, seen: Seen | undefined): boolean {
  if (category.attention > 0) return false;
  if (category.id === "posters") return true;
  if (!seen) return false;
  return seen.attention > 0 || (seen.progress > 0 && category.progress === 0);
}

export function useLiveHealthNotifications(): void {
  const { categories, loaded } = useHealthSignal();
  const items = useNotifications();
  const seen = useRef(new Map<string, Seen>());

  useEffect(() => {
    if (!loaded) return;
    const posted = new Set(items.map((item) => item.id));
    for (const id of LIVE) {
      const category = categories.find((item) => item.id === id);
      if (!category) continue;
      const last = seen.current.get(id);
      const notificationId = `health:${id}`;
      if (category.attention > 0) {
        if (category.attention !== last?.attention) post(category);
      } else if (cleared(category, last) && posted.has(notificationId))
        resolveNotifications([notificationId]);
      seen.current.set(id, {
        attention: category.attention,
        progress: category.progress,
      });
    }
  }, [categories, loaded, items]);
}
