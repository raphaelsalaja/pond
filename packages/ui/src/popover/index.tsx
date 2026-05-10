import { Popover as Base } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ ...props }: RootProps) {
  return <Base.Root {...props} />;
}

interface TriggerProps extends React.ComponentProps<typeof Base.Trigger> {}

function Trigger({ ...props }: TriggerProps) {
  return <Base.Trigger {...props} />;
}

interface CloseProps extends React.ComponentProps<typeof Base.Close> {}

function Close({ ...props }: CloseProps) {
  return <Base.Close {...props} />;
}

interface ContentProps
  extends Omit<
    React.ComponentProps<typeof Base.Positioner>,
    "className" | "children"
  > {
  children?: ReactNode;
  className?: string;
}

function Content({
  children,
  className,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  ...rest
}: ContentProps) {
  return (
    <Base.Portal>
      <Base.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={styles.positioner}
        {...rest}
      >
        <Base.Popup
          className={[styles.popup, className ?? ""].filter(Boolean).join(" ")}
        >
          {children}
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

interface ItemProps extends React.ComponentPropsWithoutRef<"button"> {}

function Item({ className, type = "button", ...props }: ItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ItemIconProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemIcon({ className, ...props }: ItemIconProps) {
  return (
    <span
      aria-hidden
      className={[styles["item-icon"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ItemLabelProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemLabel({ className, ...props }: ItemLabelProps) {
  return (
    <span
      className={[styles["item-label"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ItemKbdProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemKbd({ className, ...props }: ItemKbdProps) {
  return (
    <span
      className={[styles["item-kbd"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface GroupLabelProps extends React.ComponentPropsWithoutRef<"div"> {}

function GroupLabel({ className, ...props }: GroupLabelProps) {
  return (
    <div
      className={[styles["group-label"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface SeparatorProps extends React.ComponentPropsWithoutRef<"hr"> {}

function Separator({ className, ...props }: SeparatorProps) {
  return (
    <hr
      className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Popover = {
  Root,
  Trigger,
  Content,
  Item,
  ItemIcon,
  ItemLabel,
  ItemKbd,
  GroupLabel,
  Separator,
  Close,
};
