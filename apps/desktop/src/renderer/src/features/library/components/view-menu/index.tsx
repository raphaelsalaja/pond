import { IconSliders } from "@pond/icons";
import { Button, Popover, Tooltip } from "@pond/ui";
import {
  libraryHeader,
  useViewPopover,
} from "@/features/library/state/library-header";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import { ViewOptions } from "./board";
import styles from "./styles.module.css";

const LABEL = "View Options";

export function ViewMenu() {
  const open = useViewPopover() === "view";

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) libraryHeader.openPopover("view");
        else libraryHeader.closePopover("view");
      }}
    >
      <Tooltip
        label={LABEL}
        shortcut={<ShortcutKeys id="view.options" />}
        side="bottom"
      >
        <Button
          render={<Popover.Trigger />}
          icon
          size="sm"
          variant="ghost"
          aria-label={LABEL}
        >
          <IconSliders />
        </Button>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionAvoidance={{ side: "flip", fallbackAxisSide: "none" }}
        >
          <Popover.Popup className={styles.popup} aria-label={LABEL}>
            <ViewOptions />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
