import { IconGift } from "@pond/icons";
import { Badge, Button, Tooltip } from "@pond/ui";
import { useWhatsNewOffered, whatsNewDialog } from "@/shared/state/whats-new";
import styles from "./styles.module.css";

export function WhatsNewButton() {
  const offered = useWhatsNewOffered();
  if (!offered) return null;

  return (
    <Tooltip label="What's New" side="right">
      <Button
        className={styles.button}
        icon
        variant="ghost"
        rounding="rounded"
        aria-label="What's New"
        onClick={() => whatsNewDialog.openOffer()}
      >
        <span className={styles.cutout}>
          <span className={styles.icon}>
            <IconGift />
          </span>
        </span>
        <Badge.Dot className={styles.dot} tone="accent" />
      </Button>
    </Tooltip>
  );
}
