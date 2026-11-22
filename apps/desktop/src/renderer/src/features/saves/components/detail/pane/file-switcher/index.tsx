import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { useSaveViewerNavigation } from "@/features/saves/state/save-viewer";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

export function FileSwitcher({ saveId }: { saveId: string }) {
  const navigation = useSaveViewerNavigation();
  const shown =
    navigation !== null && navigation.saveId === saveId && navigation.count > 1;

  if (!shown) return null;
  const { index, count, onPrevious, onNext } = navigation;

  return (
    <div className={styles.switcher}>
      <Tooltip
        label="Previous Slide"
        shortcut={<ShortcutKeys id="viewer.prev-slide" />}
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
        shortcut={<ShortcutKeys id="viewer.next-slide" />}
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
