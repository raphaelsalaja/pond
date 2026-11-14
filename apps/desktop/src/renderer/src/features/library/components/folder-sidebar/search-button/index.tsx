import { IconMagnifier } from "@pond/icons";
import { Button } from "@pond/ui";
import { commandMenu } from "@/features/library/state/command-menu";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import styles from "./styles.module.css";

export function SearchButton() {
  return (
    <Button
      variant="field"
      size="sm"
      className={styles.button}
      aria-label="Search Pond"
      onClick={() => commandMenu.open()}
    >
      <IconMagnifier />
      <span className={styles.label}>Search Pond</span>
      <span className={styles.shortcut}>
        <ShortcutKeys id="library.search" />
      </span>
    </Button>
  );
}
