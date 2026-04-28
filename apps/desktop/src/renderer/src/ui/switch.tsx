import { Switch as Base } from "@base-ui-components/react/switch";
import { forwardRef } from "react";
import styles from "./switch.module.css";

/**
 * Boolean toggle. Use inside a `<Field>` for the labeled form pattern,
 * or standalone with an `aria-label` for inline toggles.
 */
export const Switch = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Base.Root>
>(function Switch({ className, ...rest }, ref) {
  return (
    <Base.Root
      ref={ref}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Base.Thumb className={styles.thumb} />
    </Base.Root>
  );
});
