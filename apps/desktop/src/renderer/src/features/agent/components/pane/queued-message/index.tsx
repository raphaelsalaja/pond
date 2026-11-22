import { IconClock, IconXmark } from "@pond/icons";
import { Button, Reveal } from "@pond/ui";
import styles from "./styles.module.css";

export function QueuedMessage({
  content,
  onSendNow,
  onRemove,
}: {
  content: string | null;
  onSendNow: () => void;
  onRemove: () => void;
}) {
  return (
    <Reveal visible={content !== null} initial={false}>
      <div className={styles.queued} role="status">
        <IconClock size={12} className={styles.icon} />
        <span className={styles.label}>Queued</span>
        <span className={styles.text} title={content ?? undefined}>
          {content}
        </span>
        <Button size="xs" variant="ghost" onClick={onSendNow}>
          Send Now
        </Button>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label="Remove queued message"
          onClick={onRemove}
        >
          <IconXmark size={12} />
        </Button>
      </div>
    </Reveal>
  );
}
