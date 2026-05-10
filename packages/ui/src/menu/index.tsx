import { Menu as Base } from "@base-ui/react/menu";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ ...props }: RootProps) {
  return <Base.Root {...props} />;
}

interface TriggerProps extends React.ComponentProps<typeof Base.Trigger> {}

function Trigger({ ...props }: TriggerProps) {
  return <Base.Trigger {...props} />;
}

interface PortalProps extends React.ComponentProps<typeof Base.Portal> {}

function Portal({ ...props }: PortalProps) {
  return <Base.Portal {...props} />;
}

interface PositionerProps
  extends React.ComponentProps<typeof Base.Positioner> {}

function Positioner({ className, sideOffset = 6, ...props }: PositionerProps) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      className={[styles.positioner, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface PopupProps extends React.ComponentProps<typeof Base.Popup> {}

function Popup({ className, ...props }: PopupProps) {
  return (
    <Base.Popup
      className={[styles.popup, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ArrowProps extends React.ComponentProps<typeof Base.Arrow> {}

function Arrow({ className, ...props }: ArrowProps) {
  return (
    <Base.Arrow
      className={[styles.arrow, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ItemProps extends React.ComponentProps<typeof Base.Item> {}

function Item({ className, ...props }: ItemProps) {
  return (
    <Base.Item
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

interface GroupProps extends React.ComponentProps<typeof Base.Group> {}

function Group({ ...props }: GroupProps) {
  return <Base.Group {...props} />;
}

interface GroupLabelProps
  extends React.ComponentProps<typeof Base.GroupLabel> {}

function GroupLabel({ className, ...props }: GroupLabelProps) {
  return (
    <Base.GroupLabel
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

interface RadioGroupProps
  extends React.ComponentProps<typeof Base.RadioGroup> {}

function RadioGroup({ ...props }: RadioGroupProps) {
  return <Base.RadioGroup {...props} />;
}

interface RadioItemProps extends React.ComponentProps<typeof Base.RadioItem> {}

function RadioItem({ className, ...props }: RadioItemProps) {
  return (
    <Base.RadioItem
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface RadioItemIndicatorProps
  extends React.ComponentProps<typeof Base.RadioItemIndicator> {}

function RadioItemIndicator({ className, ...props }: RadioItemIndicatorProps) {
  return (
    <Base.RadioItemIndicator
      className={[styles.indicator, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface CheckboxItemProps
  extends React.ComponentProps<typeof Base.CheckboxItem> {}

function CheckboxItem({ className, ...props }: CheckboxItemProps) {
  return (
    <Base.CheckboxItem
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface CheckboxItemIndicatorProps
  extends React.ComponentProps<typeof Base.CheckboxItemIndicator> {}

function CheckboxItemIndicator({
  className,
  ...props
}: CheckboxItemIndicatorProps) {
  return (
    <Base.CheckboxItemIndicator
      className={[styles.indicator, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface SubmenuRootProps
  extends React.ComponentProps<typeof Base.SubmenuRoot> {}

function SubmenuRoot({ ...props }: SubmenuRootProps) {
  return <Base.SubmenuRoot {...props} />;
}

interface SubmenuTriggerProps
  extends React.ComponentProps<typeof Base.SubmenuTrigger> {}

function SubmenuTrigger({ className, ...props }: SubmenuTriggerProps) {
  return (
    <Base.SubmenuTrigger
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
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
