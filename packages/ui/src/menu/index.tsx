import { Menu as Base } from "@base-ui/react/menu";
import { IconChevronRight as CaretRight, IconCheck } from "@pond/icons";
import { clsx as cn } from "clsx";
import { forwardRef } from "react";
import { Button, type ButtonProps } from "../button";
import { Checkbox } from "../checkbox";
import { Keyboard } from "../keyboard";
import { stopPageHotkeys } from "../stop-page-hotkeys";
import { Switch } from "../switch";
import { type MenuItemSpec, renderMenuSpec } from "./items";

import styles from "./styles.module.css";

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

type TriggerProps = Base.Trigger.Props &
  Pick<
    ButtonProps,
    "variant" | "size" | "density" | "icon" | "rounding" | "width"
  >;

function Trigger({
  className,
  variant,
  size,
  density,
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
            density={density}
            icon={icon}
            rounding={rounding}
            width={width}
            variant={variant ?? "secondary"}
            className={cn(styles.trigger, className)}
          />
        )
      }
      {...props}
    />
  );
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
      data-type="menu"
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, ...props }: Base.Popup.Props) {
  return <Base.Popup {...props} className={cn(styles.popup, className)} />;
}

const Surface = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  function Surface({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.popup, className)} {...props} />;
  },
);

function Row({
  className,
  highlighted = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { highlighted?: boolean }) {
  return (
    <button
      type={type}
      data-highlighted={highlighted || undefined}
      className={cn(styles.item, className)}
      {...props}
    />
  );
}

function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.heading, className)} {...props} />;
}

function Viewport({ className, ...props }: Base.Viewport.Props) {
  return (
    <Base.Viewport className={cn(styles.viewport, className)} {...props} />
  );
}

const List = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function List({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(styles.list, className)}
        data-scroll-fade="vertical"
        {...props}
      />
    );
  },
);

const FilterList = forwardRef<HTMLDivElement, Base.List.Props>(
  function FilterList({ className, ...props }, ref) {
    return (
      <Base.List
        ref={ref}
        className={cn(styles.list, className)}
        data-scroll-fade="vertical"
        {...props}
      />
    );
  },
);

function FilterProvider(props: Base.FilterProvider.Props) {
  return <Base.FilterProvider {...props} />;
}

function Empty({ className, ...props }: Base.Empty.Props) {
  return <Base.Empty className={cn(styles.empty, className)} {...props} />;
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return <Base.Arrow className={cn(styles.arrow, className)} {...props} />;
}

type ItemProps = Base.Item.Props & {
  stale?: boolean;
  variant?: "default" | "destructive";
};

function Item({
  className,
  stale = false,
  variant = "default",
  ...props
}: ItemProps) {
  return (
    <Base.Item
      data-stale={stale}
      data-variant={variant}
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

function ItemContent({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(styles.content, className)} {...props} />;
}

function ItemDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn(styles.description, className)} {...props} />;
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

function SwitchItemIndicator({
  className,
  keepMounted = true,
  ...props
}: Base.CheckboxItemIndicator.Props) {
  return (
    <Base.CheckboxItemIndicator
      keepMounted={keepMounted}
      className={cn(styles.indicator, className)}
      render={(renderProps, state) => (
        <Switch.Mark checked={state.checked} {...renderProps} />
      )}
      {...props}
    />
  );
}

function CheckboxItemIndicator({
  className,
  keepMounted = true,
  variant = "checkbox",
  reveal = "always",
  indeterminate,
  ...props
}: Base.CheckboxItemIndicator.Props & {
  variant?: "checkbox" | "check";
  /** `active` hides an unchecked box until its row is hovered or highlighted. */
  reveal?: "always" | "active";
  indeterminate?: boolean;
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
      data-reveal={reveal === "active" && !indeterminate ? reveal : undefined}
      render={(renderProps, state) => (
        <Checkbox.Mark
          size="sm"
          checked={state.checked}
          indeterminate={indeterminate}
          {...renderProps}
        />
      )}
      {...props}
    />
  );
}

function SubmenuRoot(props: Base.SubmenuRoot.Props) {
  return <Base.SubmenuRoot {...props} />;
}

type SubmenuTriggerProps = Base.SubmenuTrigger.Props & {
  icon?: boolean;
};

function SubmenuTrigger({ className, icon, ...props }: SubmenuTriggerProps) {
  return (
    <Base.SubmenuTrigger
      className={cn(styles.item, className)}
      data-icon={icon || undefined}
      {...props}
    >
      {props.children}
      {icon ? null : <CaretRight size={12} />}
    </Base.SubmenuTrigger>
  );
}

function SecondaryLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn(styles["secondary-label"], className)} {...props} />
  );
}

function Items({ items }: { items: MenuItemSpec[] }) {
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

function Input({ className, onKeyDown, ...props }: Base.Input.Props) {
  return (
    <Base.Input
      className={cn(styles.input, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        stopPageHotkeys(event);
      }}
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
  Surface,
  Viewport,
  List,
  Arrow,
  Item,
  Row,
  LinkItem,
  ItemIcon,
  ItemLabel,
  ItemContent,
  ItemDescription,
  ItemKeyboard,
  FilterProvider,
  FilterList,
  Input,
  Empty,
  /** Base UI names this `useFilter`, but it is a plain function safe to call outside render. */
  getFilter: Base.useFilter,
  SecondaryLabel,
  Group,
  GroupLabel,
  SectionLabel,
  Separator,
  RadioGroup,
  RadioItem,
  RadioItemIndicator,
  CheckboxItem,
  CheckboxItemIndicator,
  SwitchItemIndicator,
  SubmenuRoot,
  SubmenuTrigger,
  Items,
};

export { type MenuItemSpec, menuLabelText } from "./items";
