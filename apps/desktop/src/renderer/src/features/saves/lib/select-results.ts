import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { notify, updateNotification } from "@/shared/lib/toast";

let request = 0;

export async function selectResults(mode: "all" | "invert"): Promise<void> {
  const token = ++request;
  const key = resultNavigation.key();
  const previous = new Set(selection.snapshot());
  const notificationId = notify({
    id: "result-selection",
    title: "Selecting Saves",
    timeout: 0,
  });
  try {
    const ids = await resultNavigation.ids();
    if (request !== token) {
      updateNotification({
        id: notificationId,
        title: "Selection canceled",
        timeout: 2500,
      });
      return;
    }
    if (key !== resultNavigation.key()) {
      updateNotification({
        id: notificationId,
        title: "Selection canceled after navigation",
        timeout: 2500,
      });
      return;
    }
    const selected =
      mode === "all" ? ids : ids.filter((id) => !previous.has(id));
    selection.set(selected);
    const current = selection.getCursor();
    const cursor =
      current && selected.includes(current) ? current : (selected[0] ?? null);
    selection.setCursor(cursor);
    primarySelection.set(cursor);
    if (cursor) {
      selection.setAnchor(cursor);
    } else {
      selection.clear();
    }
    updateNotification({
      id: notificationId,
      title: `${selected.length} Saves selected`,
      timeout: 2500,
    });
  } catch {
    if (request === token) {
      updateNotification({
        id: notificationId,
        title: "Couldn't select Saves",
        description: "Try again.",
        timeout: 2500,
      });
    }
  }
}
