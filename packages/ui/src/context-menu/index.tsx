import { ContextMenu as Base } from "@base-ui/react/context-menu";
import menuStyles from "../menu/styles.module.css";
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

interface BackdropProps extends React.ComponentProps<typeof Base.Backdrop> {}

function Backdrop({ className, ...props }: BackdropProps) {
  return (
    <Base.Backdrop
      className={[styles.backdrop, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface PositionerProps
  extends React.ComponentProps<typeof Base.Positioner> {}

function Positioner({ ...props }: PositionerProps) {
  return <Base.Positioner {...props} />;
}

interface PopupProps extends React.ComponentProps<typeof Base.Popup> {}

function Popup({ className, ...props }: PopupProps) {
  return (
    <Base.Popup
      className={[menuStyles.popup, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ArrowProps extends React.ComponentProps<typeof Base.Arrow> {}

function Arrow({ className, ...props }: ArrowProps) {
  return (
    <Base.Arrow
      className={[menuStyles.arrow, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ItemProps extends React.ComponentProps<typeof Base.Item> {}

function Item({ className, ...props }: ItemProps) {
  return (
    <Base.Item
      className={[menuStyles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ItemIconProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemIcon({ className, ...props }: ItemIconProps) {
  return (
    <span
      aria-hidden
      className={[menuStyles["item-icon"], className ?? ""]
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
      className={[menuStyles["item-label"], className ?? ""]
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
      className={[menuStyles["item-kbd"], className ?? ""]
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
      className={[menuStyles["group-label"], className ?? ""]
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
      className={[menuStyles.separator, className ?? ""]
        .filter(Boolean)
        .join(" ")}
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
      className={[menuStyles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface RadioItemIndicatorProps
  extends React.ComponentProps<typeof Base.RadioItemIndicator> {}

function RadioItemIndicator({ className, ...props }: RadioItemIndicatorProps) {
  return (
    <Base.RadioItemIndicator
      className={[menuStyles.indicator, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface CheckboxItemProps
  extends React.ComponentProps<typeof Base.CheckboxItem> {}

function CheckboxItem({ className, ...props }: CheckboxItemProps) {
  return (
    <Base.CheckboxItem
      className={[menuStyles.item, className ?? ""].filter(Boolean).join(" ")}
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
      className={[menuStyles.indicator, className ?? ""]
        .filter(Boolean)
        .join(" ")}
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
      className={[menuStyles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const ContextMenu = {
  Root,
  Trigger,
  Portal,
  Backdrop,
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
