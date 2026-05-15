import { Popover as Base } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { renderFrozenPopup } from "../freeze/popup";
import { cn } from "../lib/cn";
import popupStyles from "../lib/popup.module.css";
import styles from "./styles.module.css";

interface ContentProps
  extends Omit<Base.Positioner.Props, "className" | "children"> {
  children?: ReactNode;
  className?: string;
}

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Trigger(props: Base.Trigger.Props) {
  return <Base.Trigger {...props} />;
}

function Close(props: Base.Close.Props) {
  return <Base.Close {...props} />;
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
          className={cn(popupStyles.popup, className)}
          render={renderFrozenPopup}
        >
          {children}
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

function Item({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      role="menuitem"
      className={cn(popupStyles.item, className)}
      {...props}
    />
  );
}

function ItemIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(popupStyles["item-icon"], className)}
      {...props}
    />
  );
}

function ItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn(popupStyles["item-label"], className)} {...props} />
  );
}

function ItemKbd({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(popupStyles["item-kbd"], className)} {...props} />;
}

function GroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn(popupStyles["group-label"], className)} {...props} />
  );
}

function Separator({ className, ...props }: React.ComponentProps<"hr">) {
  return <hr className={cn(popupStyles.separator, className)} {...props} />;
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
