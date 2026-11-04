import { formatNumber, formatPlural } from "@/shared/lib/format";
import { notify, updateNotification } from "@/shared/lib/toast";

const SAVES = { one: "save", other: "saves" };
const PROGRESS_LABEL = "Are.na link conversion progress";

export async function convertArenaLinks(): Promise<void> {
  const progressId = crypto.randomUUID();
  const notificationId = notify({
    id: "arena-links",
    title: "Converting Are.na links",
    description: "Finding Link saves",
    progress: { label: PROGRESS_LABEL },
    timeout: 0,
  });
  const unsubscribe = window.pond.onArenaLinkProgress((progress) => {
    if (progress.id !== progressId || progress.total === 0) return;
    updateNotification({
      id: notificationId,
      title: "Converting Are.na links",
      description: `${formatNumber(progress.processed)} of ${formatPlural(progress.total, SAVES)}`,
      progress: {
        label: PROGRESS_LABEL,
        detail: `${progress.converted} converted · ${progress.failed} failed`,
        value: progress.processed,
        max: progress.total,
      },
      timeout: 0,
    });
  });
  try {
    const result = await window.pond.query("arenaLinks.convert", {
      progressId,
    });
    if (!result.ok) {
      updateNotification({
        id: notificationId,
        title: "Already converting Are.na links",
        timeout: 5000,
      });
      return;
    }
    updateNotification({
      id: notificationId,
      title:
        result.total === 0
          ? "No Are.na links to convert"
          : `Converted ${formatPlural(result.converted, SAVES)}`,
      description:
        result.failed > 0
          ? `${formatNumber(result.failed)} failed. Refresh them to try again.`
          : undefined,
      timeout: 5000,
    });
  } catch {
    updateNotification({
      id: notificationId,
      title: "Couldn't convert Are.na links",
      description: "Try again from Storage in Settings.",
      timeout: 8000,
    });
  } finally {
    unsubscribe();
  }
}
