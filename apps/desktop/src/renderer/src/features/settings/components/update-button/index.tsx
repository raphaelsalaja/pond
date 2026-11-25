import { IconArrowRotateClockwise, IconDownload } from "@pond/icons";
import { Badge, Button, Tooltip } from "@pond/ui";
import type { UpdateNotice } from "@shared/update-notice";
import { openUpdateOverlay } from "@/features/settings/components/update-dialog/session";
import { useUpdateNotice } from "@/features/settings/components/update-dialog/use-update-dialog";
import styles from "./styles.module.css";

function label(notice: UpdateNotice): string {
  if (notice.phase === "downloaded") return "Restart to Update";
  if (notice.downloading) {
    return notice.progress === undefined
      ? "Downloading Update"
      : `Downloading Update ${Math.round(notice.progress * 100)}%`;
  }
  return `Update to ${notice.version}`;
}

export function UpdateButton() {
  const notice = useUpdateNotice();
  if (!notice) return null;

  const text = label(notice);
  return (
    <Tooltip label={text} side="right">
      <Button
        className={styles.button}
        icon
        variant="ghost"
        rounding="rounded"
        aria-label={text}
        onClick={() => openUpdateOverlay()}
      >
        {notice.phase === "downloaded" ? (
          <IconArrowRotateClockwise />
        ) : (
          <IconDownload />
        )}
        <Badge.Dot className={styles.dot} tone="accent" />
      </Button>
    </Tooltip>
  );
}
