import { ContextMenu as Base } from "@base-ui/react/context-menu";
import { IconCaretRight as CaretRight, IconCheck } from "@pond/icons";
import { clsx as cn } from "clsx";
import { Checkbox } from "../checkbox";
import { Keyboard } from "../keyboard";
import { Menu } from "../menu";
import { renderMenuSpec } from "../menu/items";
import type { MenuItemSpec } from "../menu/items";
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

function Backdrop({ className, ...props }: Base.Backdrop.Props) {
  return (
    <Base.Backdrop className={cn(styles.backdrop, className)} {...props} />
  );
}

function Positioner({ className, ...props }: Base.Positioner.Props) {
  return (
    <Base.Positioner
      data-type="context-menu"
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, ...props }: Base.Popup.Props) {
  return <Base.Popup {...props} className={cn(styles.popup, className)} />;
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return <Base.Arrow className={cn(styles.arrow, className)} {...props} />;
}

type ItemProps = Base.Item.Props & {
  stale?: boolean;
};

function Item({ className, stale = false, ...props }: ItemProps) {
  return (
    <Base.Item
      data-stale={stale}
      className={cn(styles.item, className)}
      {...props}
    />
  );
}

function LinkItem({ className, ...props }: Base.LinkItem.Props) {
  return <Base.LinkItem className={cn(styles.item, className)} {...props} />;
}

function ItemIcon({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden className={cn(styles.icon, className)} {...props} />;
}

function ItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(styles.label, className)} {...props} />;
}

function ItemKeyboard({
  className,
  ...props
}: React.ComponentProps<typeof Keyboard.Shortcut>) {
  return (
    <Keyboard.Shortcut
      density="flat"
      className={cn(styles.keyboard, className)}
      {...props}
    />
  );
}

function Group(props: Base.Group.Props) {
  return <Base.Group {...props} />;
}

function GroupLabel({ className, ...props }: Base.GroupLabel.Props) {
  return (
    <Base.GroupLabel className={cn(styles.heading, className)} {...props} />
  );
}

function Separator({ className, ...props }: React.ComponentProps<"hr">) {
  return <hr className={cn(styles.separator, className)} {...props} />;
}

function RadioGroup(props: Base.RadioGroup.Props) {
  return <Base.RadioGroup {...props} />;
}

function RadioItem({ className, ...props }: Base.RadioItem.Props) {
  return <Base.RadioItem className={cn(styles.item, className)} {...props} />;
}

function RadioItemIndicator({
  className,
  keepMounted = true,
  ...props
}: Base.RadioItemIndicator.Props) {
  return (
    <Base.RadioItemIndicator
      keepMounted={keepMounted}
      className={cn(styles["check-indicator"], className)}
      {...props}
    >
      <IconCheck size={14} aria-hidden />
    </Base.RadioItemIndicator>
  );
}

function CheckboxItem({ className, ...props }: Base.CheckboxItem.Props) {
  return (
    <Base.CheckboxItem className={cn(styles.item, className)} {...props} />
  );
}

function CheckboxItemIndicator({
  className,
  keepMounted = true,
  variant = "checkbox",
  ...props
}: Base.CheckboxItemIndicator.Props & {
  variant?: "checkbox" | "check";
}) {
  if (variant === "check") {
    return (
      <Base.CheckboxItemIndicator
        keepMounted={keepMounted}
        className={cn(styles["check-indicator"], className)}
        {...props}
      >
        <IconCheck size={14} aria-hidden />
      </Base.CheckboxItemIndicator>
    );
  }

  return (
    <Base.CheckboxItemIndicator
      keepMounted={keepMounted}
      className={cn(styles.indicator, className)}
      render={(renderProps, state) => (
        <Checkbox.Mark size="sm" checked={state.checked} {...renderProps} />
      )}
      {...props}
    />
  );
}

function SubmenuRoot(props: Base.SubmenuRoot.Props) {
  return <Base.SubmenuRoot {...props} />;
}

function SubmenuTrigger({ className, ...props }: Base.SubmenuTrigger.Props) {
  return (
    <Base.SubmenuTrigger className={cn(styles.item, className)} {...props}>
      {props.children}
      <CaretRight size={12} />
    </Base.SubmenuTrigger>
  );
}

function Items({ items }: { items: Array<MenuItemSpec> }) {
  return (
    <>
      {renderMenuSpec(items, {
        Item,
        ItemIcon,
        ItemLabel,
        ItemKeyboard,
        CheckboxItem,
        CheckboxItemIndicator,
        RadioGroup,
        RadioItem,
        RadioItemIndicator,
        LinkItem,
        Separator,
        Group,
        GroupLabel,
        SubmenuRoot,
        SubmenuTrigger,
        Portal,
        Positioner,
        Popup,
      })}
    </>
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
  LinkItem,
  ItemIcon,
  ItemLabel,
  ItemKeyboard,
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
  /** Base UI's `ContextMenu.Root` renders `Menu.Root`, which reads the menu filter provider. */
  FilterProvider: Menu.FilterProvider,
  FilterList: Menu.FilterList,
  Input: Menu.Input,
  Empty: Menu.Empty,
  Items,
};
