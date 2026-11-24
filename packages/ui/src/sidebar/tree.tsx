import { IconCaretRight as CaretRight } from "@pond/icons";
import {
  TreeGroup as TreeGroupPart,
  TreeItemIndicator,
  TreeItemLabel,
  TreeItem as TreeItemPart,
  type TreeMode,
  Tree as TreeRoot,
  type TreeProps as TreeRootProps,
} from "@ui-sdk/react/tree";
import { clsx as cn } from "clsx";
import type { ComponentProps } from "react";
import styles from "./styles.module.css";

type StateClassName<State> =
  | string
  | ((state: State) => string | undefined)
  | undefined;

function withClass<State>(
  base: string | undefined,
  className: StateClassName<State>,
) {
  return className instanceof Function
    ? (state: State) => cn(base, className(state))
    : cn(base, className);
}

type TreeProps<Mode extends TreeMode = "single"> = TreeRootProps<Mode>;

/** Rows are destinations, so pressing one selects it and only the indicator or arrow keys expand it. */
export function Tree<Mode extends TreeMode = "single">(props: TreeProps<Mode>) {
  return (
    <TreeRoot<Mode>
      expandOnPress={false}
      {...props}
      className={withClass(styles.tree, props.className)}
    />
  );
}

type TreeItemProps = ComponentProps<typeof TreeItemPart>;

export function TreeItem({ className, ...props }: TreeItemProps) {
  return (
    <TreeItemPart className={withClass(styles.node, className)} {...props} />
  );
}

type TreeRowProps = ComponentProps<typeof TreeItemLabel>;

export function TreeRow({ className, ...props }: TreeRowProps) {
  return (
    <TreeItemLabel
      className={withClass(cn(styles.item, styles.row), className)}
      data-hover-row=""
      {...props}
    />
  );
}

type TreeIndicatorProps = ComponentProps<typeof TreeItemIndicator>;

export function TreeIndicator({
  className,
  children,
  ...props
}: TreeIndicatorProps) {
  return (
    <TreeItemIndicator
      className={withClass(styles.indicator, className)}
      {...props}
    >
      {children ?? <CaretRight size={12} aria-hidden />}
    </TreeItemIndicator>
  );
}

type TreeGroupProps = ComponentProps<typeof TreeGroupPart>;

export function TreeGroup({ className, ...props }: TreeGroupProps) {
  return (
    <TreeGroupPart
      className={withClass(styles.subtree, className)}
      {...props}
    />
  );
}
