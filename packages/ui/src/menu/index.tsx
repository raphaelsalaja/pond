import { Menu as Base } from "@base-ui/react/menu";
import { renderFrozenPopup } from "../freeze/popup";
import { cn } from "../lib/cn";
import popupStyles from "../lib/popup.module.css";
import styles from "./styles.module.css";

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Trigger(props: Base.Trigger.Props) {
  return <Base.Trigger {...props} />;
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Positioner({
  className,
  sideOffset = 6,
  ...props
}: Base.Positioner.Props) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, render, ...props }: Base.Popup.Props) {
  return (
    <Base.Popup
      {...props}
      className={cn(popupStyles.popup, popupStyles["popup-compact"], className)}
      render={render ?? renderFrozenPopup}
    />
  );
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return <Base.Arrow className={cn(popupStyles.arrow, className)} {...props} />;
}

function Item({ className, ...props }: Base.Item.Props) {
  return (
    <Base.Item
      className={cn(popupStyles.item, popupStyles["item-compact"], className)}
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

function Group(props: Base.Group.Props) {
  return <Base.Group {...props} />;
}

function GroupLabel({ className, ...props }: Base.GroupLabel.Props) {
  return (
    <Base.GroupLabel
      className={cn(popupStyles["group-label"], className)}
      {...props}
    />
  );
}

function Separator({ className, ...props }: React.ComponentProps<"hr">) {
  return <hr className={cn(popupStyles.separator, className)} {...props} />;
}

function RadioGroup(props: Base.RadioGroup.Props) {
  return <Base.RadioGroup {...props} />;
}

function RadioItem({ className, ...props }: Base.RadioItem.Props) {
  return (
    <Base.RadioItem
      className={cn(popupStyles.item, popupStyles["item-compact"], className)}
      {...props}
    />
  );
}

function RadioItemIndicator({
  className,
  ...props
}: Base.RadioItemIndicator.Props) {
  return (
    <Base.RadioItemIndicator
      className={cn(popupStyles.indicator, className)}
      {...props}
    />
  );
}

function CheckboxItem({ className, ...props }: Base.CheckboxItem.Props) {
  return (
    <Base.CheckboxItem
      className={cn(popupStyles.item, popupStyles["item-compact"], className)}
      {...props}
    />
  );
}

function CheckboxItemIndicator({
  className,
  ...props
}: Base.CheckboxItemIndicator.Props) {
  return (
    <Base.CheckboxItemIndicator
      className={cn(popupStyles.indicator, className)}
      {...props}
    />
  );
}

function SubmenuRoot(props: Base.SubmenuRoot.Props) {
  return <Base.SubmenuRoot {...props} />;
}

function SubmenuTrigger({ className, ...props }: Base.SubmenuTrigger.Props) {
  return (
    <Base.SubmenuTrigger
      className={cn(popupStyles.item, popupStyles["item-compact"], className)}
      {...props}
    />
  );
}

export const Menu = {
  Root,
  Trigger,
  Portal,
  Positioner,
  Popup,
  Arrow,
  Item,
  ItemIcon,
  ItemLabel,
  ItemKbd,
  Group,
  GroupLabel,
  Separator,
  RadioGroup,
  RadioItem,
  RadioItemIndicator,
  CheckboxItem,
  CheckboxItemIndicator,
  SubmenuRoot,
  SubmenuTrigger,
};
