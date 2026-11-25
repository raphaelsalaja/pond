import { IconXmark } from "@pond/icons";
import { Button } from "@pond/ui";
import styles from "./styles.module.css";

export function FramelessWindowChrome({
  align = "card",
  closeLabel,
  onClose,
}: {
  align?: "card" | "title";
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.chrome}
      data-align={align === "title" ? "title" : undefined}
    >
      <Button
        className={styles.close}
        type="button"
        icon
        size="sm"
        variant="ghost"
        rounding="full"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <IconXmark />
      </Button>
    </div>
  );
}
