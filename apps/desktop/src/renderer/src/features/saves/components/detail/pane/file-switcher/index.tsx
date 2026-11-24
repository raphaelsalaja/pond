import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

export interface FilePager {
  index: number;
  count: number;
  onPrevious(): void;
  onNext(): void;
}

export function FileSwitcher({
  pager,
  shortcuts = false,
}: {
  pager: FilePager;
  /** The viewer's slide shortcuts only apply while it's open. */
  shortcuts?: boolean;
}) {
  const { index, count, onPrevious, onNext } = pager;
  if (count < 2) return null;

  return (
    <div className={styles.switcher}>
      <Tooltip
        label="Previous Slide"
        shortcut={
          shortcuts ? <ShortcutKeys id="viewer.prev-slide" /> : undefined
        }
      >
        <Button
          icon
          size="sm"
          variant="ghost"
          aria-label="Previous Slide"
          disabled={index <= 0}
          onClick={onPrevious}
        >
          <IconArrowLeft />
        </Button>
      </Tooltip>
      <span className={styles.position}>
        {index + 1} / {count}
      </span>
      <Tooltip
        label="Next Slide"
        shortcut={
          shortcuts ? <ShortcutKeys id="viewer.next-slide" /> : undefined
        }
      >
        <Button
          icon
          size="sm"
          variant="ghost"
          aria-label="Next Slide"
          disabled={index >= count - 1}
          onClick={onNext}
        >
          <IconArrowRight />
        </Button>
      </Tooltip>
    </div>
  );
}
