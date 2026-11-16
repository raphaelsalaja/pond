import { clsx as cn } from "clsx";
import { forwardRef, type Ref } from "react";
import { Button, type ButtonProps } from "../button";
import { Popover } from "../popover";
import { stopPageHotkeys } from "../stop-page-hotkeys";
import { Item, ItemIcon, ItemLabel, ItemMeta, SelectionMark } from "./item";
import styles from "./styles.module.css";

export {
  nextPickerIndex,
  type PickerCursorOptions,
  usePickerCursor,
} from "./cursor";
export type { PickerSelectionState } from "./item";

function Positioner({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof Popover.Positioner>) {
  return (
    <Popover.Positioner
      {...props}
      sideOffset={sideOffset}
      className={cn(styles.positioner, className)}
    />
  );
}

type TriggerProps = Omit<
  React.ComponentProps<typeof Popover.Trigger>,
  "className"
> &
  Pick<
    ButtonProps,
    "className" | "icon" | "rounding" | "size" | "variant" | "width"
  >;

function Trigger({
  className,
  icon,
  rounding,
  size,
  variant,
  width,
  ...props
}: TriggerProps) {
  return (
    <Popover.Trigger
      render={
        props.render ? (
          props.render
        ) : (
          <Button
            className={className}
            icon={icon}
            rounding={rounding}
            size={size}
            variant={variant ?? "secondary"}
            width={width}
          />
        )
      }
      {...props}
    />
  );
}

function Popup({
  className,
  ...props
}: React.ComponentProps<typeof Popover.Popup>) {
  return <Popover.Popup {...props} className={cn(styles.popup, className)} />;
}

function Surface({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.surface, className)} />;
}

function Header({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.header, className)} />;
}

type SearchName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

type SearchProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "aria-label" | "aria-labelledby"
> &
  SearchName;

const Search = forwardRef(function Search(
  { className, onKeyDown, ...props }: SearchProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      ref={ref}
      type="text"
      spellCheck={false}
      className={cn(styles.search, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        stopPageHotkeys(event);
      }}
    />
  );
});

function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.toolbar, className)} />;
}

function ToolbarButton({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      data-active={active ? "" : undefined}
      className={cn(styles["toolbar-button"], className)}
    />
  );
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.body, className)} />;
}

function Sidebar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-scroll-fade="vertical"
      {...props}
      className={cn(styles.sidebar, className)}
    />
  );
}

function Collection({
  className,
  role = "listbox",
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-scroll-fade="vertical"
      {...props}
      role={role}
      className={cn(styles.collection, className)}
    />
  );
}

function Group({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.group, className)} />;
}

function GroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles["group-label"], className)} />;
}

function SectionButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      className={cn(styles["section-button"], className)}
    />
  );
}

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.empty, className)} />;
}

function Footer({ className, ...props }: React.ComponentProps<"div">) {
  return <div {...props} className={cn(styles.footer, className)} />;
}

function Hint({ className, ...props }: React.ComponentProps<"span">) {
  return <span {...props} className={cn(styles.hint, className)} />;
}

export const PickerPanel = {
  Root: Popover.Root,
  Trigger,
  Portal: Popover.Portal,
  Positioner,
  Popup,
  Close: Popover.Close,
  Surface,
  Header,
  Search,
  Toolbar,
  ToolbarButton,
  Body,
  Sidebar,
  Collection,
  Group,
  GroupLabel,
  SectionButton,
  Item,
  SelectionMark,
  ItemIcon,
  ItemLabel,
  ItemMeta,
  Empty,
  Footer,
  Hint,
};
