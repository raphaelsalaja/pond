import { Select as Base } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { Button } from "../button";
import styles from "./styles.module.css";

function Root<T extends string | number | null>(
  props: React.ComponentProps<typeof Base.Root<T>>,
) {
  return <Base.Root {...props} />;
}

interface TriggerProps extends React.ComponentProps<typeof Base.Trigger> {}

function Trigger({ children, className, ...props }: TriggerProps) {
  return (
    <Base.Trigger
      render={
        <Button
          className={[styles.trigger, className ?? ""]
            .filter(Boolean)
            .join(" ")}
        />
      }
      {...props}
    >
      {children}
      <Base.Icon className={styles.icon}>▾</Base.Icon>
    </Base.Trigger>
  );
}

interface ValueProps extends React.ComponentProps<typeof Base.Value> {}

function Value({ ...props }: ValueProps) {
  return <Base.Value {...props} />;
}

interface ContentProps {
  children: ReactNode;
}

function Content({ children }: ContentProps) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={6} className={styles.positioner}>
        <Base.Popup className={styles.popup}>{children}</Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

interface ItemProps extends React.ComponentProps<typeof Base.Item> {}

function Item({ children, className, ...props }: ItemProps) {
  return (
    <Base.Item
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      <Base.ItemIndicator className={styles.indicator}>✓</Base.ItemIndicator>
      <Base.ItemText className={styles["item-text"]}>{children}</Base.ItemText>
    </Base.Item>
  );
}

export const Select = {
  Root,
  Trigger,
  Value,
  Content,
  Item,
};
