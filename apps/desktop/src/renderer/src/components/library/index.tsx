import { createContext, type ReactNode, use } from "react";
import { cn } from "@/lib/cn";
import styles from "./styles.module.css";

type LibraryView = "grid" | "list";
type GridLayout = "waterfall" | "grid" | "justified";

interface LibraryContextValue {
  view: LibraryView;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibraryContext(): LibraryContextValue {
  const ctx = use(LibraryContext);
  if (!ctx) {
    throw new Error("Library.* must be rendered inside <Library.Root>");
  }
  return ctx;
}

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  view: LibraryView;
  children: ReactNode;
}

function Root({ view, className, children, ...props }: RootProps) {
  return (
    <LibraryContext value={{ view }}>
      <div data-view={view} className={cn(styles.root, className)} {...props}>
        {children}
      </div>
    </LibraryContext>
  );
}

interface GridProps extends React.ComponentPropsWithRef<"ul"> {
  /** Layout mode. Defaults to `"grid"` (uniform square tiles). */
  layout?: GridLayout;
  multiSelect?: boolean;
}

function Grid({
  layout = "grid",
  multiSelect,
  className,
  ...props
}: GridProps) {
  const layoutClass =
    layout === "waterfall"
      ? styles["grid-waterfall"]
      : layout === "justified"
        ? styles["grid-justified"]
        : styles["grid-grid"];
  return (
    <ul
      className={cn(
        styles.grid,
        layoutClass,
        multiSelect && styles["grid-multiselect"],
        className,
      )}
      data-layout={layout}
      data-multi-select={multiSelect ? "true" : undefined}
      {...props}
    />
  );
}

interface ListProps extends React.ComponentPropsWithoutRef<"table"> {}

function List({ className, ...props }: ListProps) {
  return <table className={cn(className)} {...props} />;
}

interface ItemProps extends React.ComponentPropsWithRef<"li"> {
  selected?: boolean;
  multi?: boolean;
  dimmed?: boolean;
}

function ItemBase({ selected, multi, dimmed, className, ...props }: ItemProps) {
  return (
    <li
      className={cn(
        styles.item,
        selected && styles["item-selected"],
        multi && styles["item-multi"],
        dimmed && styles["item-dimmed"],
        className,
      )}
      data-selected={selected ? "true" : undefined}
      data-multi={multi ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      {...props}
    />
  );
}

interface ItemSelectProps extends React.ComponentPropsWithoutRef<"button"> {}

function ItemSelect({ className, type, ...props }: ItemSelectProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(styles.select, className)}
      {...props}
    />
  );
}

interface ItemMediaProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemMedia({ className, ...props }: ItemMediaProps) {
  return <div className={cn(styles.media, className)} {...props} />;
}

interface ItemMetaProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemMeta({ className, ...props }: ItemMetaProps) {
  return <div className={cn(styles.meta, className)} {...props} />;
}

interface ItemTitleProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemTitle({ className, ...props }: ItemTitleProps) {
  return <span className={cn(styles.title, className)} {...props} />;
}

interface ItemTimeProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemTime({ className, ...props }: ItemTimeProps) {
  return <span className={cn(styles.time, className)} {...props} />;
}

interface ItemCountProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemCount({ className, role, ...props }: ItemCountProps) {
  return (
    <span
      role={role ?? "status"}
      className={cn(styles.count, className)}
      {...props}
    />
  );
}

interface ItemSourceBadgeProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemSourceBadge({ className, ...props }: ItemSourceBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(styles["source-badge"], className)}
      {...props}
    />
  );
}

interface ItemDeleteProps extends React.ComponentPropsWithoutRef<"button"> {}

function ItemDelete({ className, type, ...props }: ItemDeleteProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(styles.delete, className)}
      {...props}
    />
  );
}

interface ItemCheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, "children"> {
  checked: boolean;
}

function ItemCheckbox({
  checked,
  className,
  type,
  ...props
}: ItemCheckboxProps) {
  return (
    <button
      type={type ?? "button"}
      aria-pressed={checked}
      className={cn(styles.checkbox, className)}
      {...props}
    >
      <span aria-hidden className={styles.checkmark}>
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}

interface ItemActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function ItemActions({ className, ...props }: ItemActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

const Item = Object.assign(ItemBase, {
  Select: ItemSelect,
  Media: ItemMedia,
  Meta: ItemMeta,
  Title: ItemTitle,
  Time: ItemTime,
  Count: ItemCount,
  SourceBadge: ItemSourceBadge,
  Delete: ItemDelete,
  Checkbox: ItemCheckbox,
  Actions: ItemActions,
});

interface EmptyProps extends React.ComponentPropsWithoutRef<"p"> {}

function Empty({ className, ...props }: EmptyProps) {
  return <p className={cn(styles.empty, className)} {...props} />;
}

export const Library = {
  Root,
  Grid,
  List,
  Item,
  Empty,
};

export type { GridLayout, LibraryView };
