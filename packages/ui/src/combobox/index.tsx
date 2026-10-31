import { Combobox as Base } from "@base-ui/react/combobox";
import {
  IconCheck as Check,
  IconChevronDown as Expand,
  IconXmark,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import { Button, type ButtonProps } from "../button";
import { stopPageHotkeys } from "../stop-page-hotkeys";
import styles from "./styles.module.css";

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

function Value({
  className,
  ...props
}: Base.Value.Props & { className?: string }) {
  return (
    <span className={cn(styles.value, className)}>
      <Base.Value {...props} />
    </span>
  );
}

function Icon({ className, ...props }: Base.Icon.Props) {
  return <Base.Icon className={cn(styles.icon, className)} {...props} />;
}

function Input({ className, onKeyDown, ...props }: Base.Input.Props) {
  return (
    <Base.Input
      {...props}
      className={cn(styles.input, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        stopPageHotkeys(event);
      }}
    />
  );
}

function InputGroup({ className, ...props }: Base.InputGroup.Props) {
  return <Base.InputGroup className={cn(styles.field, className)} {...props} />;
}

function Chips({ className, ...props }: Base.Chips.Props) {
  return <Base.Chips className={cn(styles.chips, className)} {...props} />;
}

function Chip({ className, children, ...props }: Base.Chip.Props) {
  return (
    <Base.Chip className={cn(styles.chip, className)} {...props}>
      {children}
    </Base.Chip>
  );
}

function ChipRemove({ className, children, ...props }: Base.ChipRemove.Props) {
  return (
    <Base.ChipRemove
      className={cn(styles["chip-remove"], className)}
      {...props}
    >
      {children ?? <IconXmark size={12} />}
    </Base.ChipRemove>
  );
}

function ChipsInput({ className, onKeyDown, ...props }: Base.Input.Props) {
  return (
    <Base.Input
      {...props}
      className={cn(styles["chips-input"], className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        stopPageHotkeys(event);
      }}
    />
  );
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Backdrop({ className, ...props }: Base.Backdrop.Props) {
  return (
    <Base.Backdrop className={cn(styles.backdrop, className)} {...props} />
  );
}

function Positioner({
  className,
  sideOffset = 6,
  ...props
}: Base.Positioner.Props) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      data-type="combobox"
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, ...props }: Base.Popup.Props) {
  return <Base.Popup className={cn(styles.popup, className)} {...props} />;
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return <Base.Arrow className={cn(styles.arrow, className)} {...props} />;
}

function List({ className, ...props }: Base.List.Props) {
  return <Base.List className={cn(styles.list, className)} {...props} />;
}

function Empty({ className, ...props }: Base.Empty.Props) {
  return <Base.Empty className={cn(styles.empty, className)} {...props} />;
}

function Item({ className, ...props }: Base.Item.Props) {
  return <Base.Item className={cn(styles.item, className)} {...props} />;
}

function ItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(styles["item-label"], className)} {...props} />;
}

function ItemEnd({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(styles["item-end"], className)} {...props} />;
}

function ItemMeta({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(styles["item-meta"], className)} {...props} />;
}

function ItemIndicator({ className, ...props }: Base.ItemIndicator.Props) {
  return (
    <Base.ItemIndicator className={cn(styles.indicator, className)} {...props}>
      <Check size={12} />
    </Base.ItemIndicator>
  );
}

function Group({ className, ...props }: Base.Group.Props) {
  return <Base.Group className={cn(styles.group, className)} {...props} />;
}

function GroupLabel({ className, ...props }: Base.GroupLabel.Props) {
  return (
    <Base.GroupLabel
      className={cn(styles["group-label"], className)}
      {...props}
    />
  );
}

function Separator({ className, ...props }: Base.Separator.Props) {
  return (
    <Base.Separator className={cn(styles.separator, className)} {...props} />
  );
}

function Collection(props: Base.Collection.Props) {
  return <Base.Collection {...props} />;
}

export const Combobox = {
  Root,
  Label,
  Trigger,
  Value,
  Icon,
  Input,
  InputGroup,
  Chips,
  Chip,
  ChipRemove,
  ChipsInput,
  Portal,
  Backdrop,
  Positioner,
  Popup,
  Arrow,
  List,
  Empty,
  Item,
  ItemLabel,
  ItemEnd,
  ItemMeta,
  ItemIndicator,
  Group,
  GroupLabel,
  Separator,
  Collection,
};
