import { IconMagnifier } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { commandMenu } from "@/features/library/state/command-menu";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

const LABEL = "Search Pond";

export function SearchButton() {
  return (
    <Tooltip
      label={LABEL}
      shortcut={<ShortcutKeys id="library.search" />}
      side="bottom"
    >
      <Button
        variant="field"
        size="sm"
        className={styles.button}
        aria-label={LABEL}
        onClick={() => commandMenu.open()}
      >
        <IconMagnifier />
        <span className={styles.label}>{LABEL}</span>
        <span className={styles.shortcut}>
          <ShortcutKeys id="library.search" />
        </span>
      </Button>
    </Tooltip>
  );
}
