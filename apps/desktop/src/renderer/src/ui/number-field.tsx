import { NumberField as Base } from "@base-ui-components/react/number-field";
import styles from "./number-field.module.css";

/**
 * Numeric input with increment/decrement buttons. Used in Welcome for
 * the local API port.
 */
export function NumberField({
  className,
  ...rest
}: React.ComponentProps<typeof Base.Root>) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Base.Group className={styles.group}>
        <Base.Decrement className={styles.button} aria-label="Decrement">
          −
        </Base.Decrement>
        <Base.Input className={styles.input} />
        <Base.Increment className={styles.button} aria-label="Increment">
          +
        </Base.Increment>
      </Base.Group>
    </Base.Root>
  );
}
