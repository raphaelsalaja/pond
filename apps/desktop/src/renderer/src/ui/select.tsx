import { Select as Base } from "@base-ui-components/react/select";
import type { ReactNode } from "react";
import { Button } from "./button";
import styles from "./select.module.css";

/**
 * Dropdown select. Composition mirrors Base UI:
 *
 *   <Select value={tagging} onValueChange={setTagging}>
 *     <SelectTrigger>
 *       <SelectValue />
 *     </SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="off">Off</SelectItem>
 *       <SelectItem value="suggest">Suggest tags</SelectItem>
 *       <SelectItem value="auto-apply">Auto-apply tags</SelectItem>
 *     </SelectContent>
 *   </Select>
 */
export function Select<T extends string | number | null>(
  props: React.ComponentProps<typeof Base.Root<T>>,
) {
  return <Base.Root {...props} />;
}

export function SelectTrigger({
  children,
  className,
  ...rest
}: React.ComponentProps<typeof Base.Trigger>) {
  return (
    <Base.Trigger
      render={
        <Button
          variant="default"
          size="md"
          className={[styles.trigger, className ?? ""]
            .filter(Boolean)
            .join(" ")}
        />
      }
      {...rest}
    >
      {children}
      <Base.Icon className={styles.icon}>▾</Base.Icon>
    </Base.Trigger>
  );
}

export function SelectValue(props: React.ComponentProps<typeof Base.Value>) {
  return <Base.Value {...props} />;
}

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={6} className={styles.positioner}>
        <Base.Popup className={styles.popup}>{children}</Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

export function SelectItem({
  children,
  className,
  ...rest
}: React.ComponentProps<typeof Base.Item>) {
  return (
    <Base.Item
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Base.ItemIndicator className={styles.indicator}>✓</Base.ItemIndicator>
      <Base.ItemText className={styles.itemText}>{children}</Base.ItemText>
    </Base.Item>
  );
}
