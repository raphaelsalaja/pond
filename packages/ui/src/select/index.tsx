import { Select as Base } from "@base-ui/react/select";
import { IconCheck as Check, IconChevronDown as Expand } from "@pond/icons";
import { clsx as cn } from "clsx";
import { Button, type ButtonProps } from "../button";
import { renderSelectSpec, type SelectItemSpec } from "./items";
import styles from "./styles.module.css";

export type { SelectItemSpec } from "./items";

function Root<Value, Multiple extends boolean | undefined = false>(
  props: Base.Root.Props<Value, Multiple>,
) {
  return <Base.Root {...props} />;
}

function Label({ className, ...props }: Base.Label.Props) {
  return <Base.Label className={cn(styles.label, className)} {...props} />;
}

type TriggerProps = Base.Trigger.Props &
  Pick<ButtonProps, "variant" | "size" | "icon" | "rounding" | "width">;

function Trigger({
  className,
  variant,
  size,
  icon,
  rounding,
  width,
  ...props
}: TriggerProps) {
  return (
    <Base.Trigger
      render={
        props.render ? (
          props.render
        ) : (
          <Button
            size={size}
            icon={icon}
            rounding={rounding}
            width={width}
            variant={variant ?? "secondary"}
            className={cn(styles.trigger, className)}
          >
            {props.children}
            <Icon>
              <Expand size={12} />
            </Icon>
          </Button>
        )
      }
      {...props}
    />
  );
}

function Value({ className, ...props }: Base.Value.Props) {
  return <Base.Value className={cn(styles.value, className)} {...props} />;
}

function Icon({ className, ...props }: Base.Icon.Props) {
  return <Base.Icon className={cn(styles.icon, className)} {...props} />;
}

function Backdrop({ className, ...props }: Base.Backdrop.Props) {
  return (
    <Base.Backdrop className={cn(styles.backdrop, className)} {...props} />
  );
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Positioner({
  className,
  sideOffset = 8,
  alignItemWithTrigger = false,
  ...props
}: Base.Positioner.Props) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      data-type="select"
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, ...props }: Base.Popup.Props) {
  return <Base.Popup {...props} className={cn(styles.popup, className)} />;
}

function List({ className, ...props }: Base.List.Props) {
  return <Base.List {...props} className={cn(styles.list, className)} />;
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return <Base.Arrow className={cn(styles.arrow, className)} {...props} />;
}

function Item({ className, ...props }: Base.Item.Props) {
  return <Base.Item className={cn(styles.item, className)} {...props} />;
}

function ItemText({ className, ...props }: Base.ItemText.Props) {
  return (
    <Base.ItemText className={cn(styles["item-label"], className)} {...props} />
  );
}

function ItemIndicator({ className, ...props }: Base.ItemIndicator.Props) {
  return (
    <Base.ItemIndicator className={cn(styles.indicator, className)} {...props}>
      <Check size={12} />
    </Base.ItemIndicator>
  );
}

function Group(props: Base.Group.Props) {
  return <Base.Group {...props} />;
}

function GroupLabel({ className, ...props }: Base.GroupLabel.Props) {
  return (
    <Base.GroupLabel
      className={cn(
        styles["group-label"],
        styles["group-label-sticky"],
        className,
      )}
      {...props}
    />
  );
}

function Separator({ className, ...props }: Base.Separator.Props) {
  return (
    <Base.Separator className={cn(styles.separator, className)} {...props} />
  );
}

function Items<Value>({ items }: { items: SelectItemSpec<Value>[] }) {
  return (
    <List>
      {renderSelectSpec(items, {
        Item,
        ItemText,
        ItemIndicator,
        Group,
        GroupLabel,
        Separator,
      })}
    </List>
  );
}

export const Select = {
  Root,
  Label,
  Trigger,
  Value,
  Icon,
  Backdrop,
  Portal,
  Positioner,
  Popup,
  List,
  Arrow,
  Item,
  ItemText,
  ItemIndicator,
  Group,
  GroupLabel,
  Separator,
  Items,
};
