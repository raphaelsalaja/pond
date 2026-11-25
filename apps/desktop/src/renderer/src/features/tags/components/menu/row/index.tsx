import {
  IconChevronRight as ChevronRight,
  IconPlus as Plus,
} from "@pond/icons";
import { PickerPanel } from "@pond/ui";
import type { PickerSelectionState } from "@pond/ui";
import type { ComponentPropsWithoutRef } from "react";
import type { TagGroupRow } from "@/features/tags/state/tag-groups";
import type { TagRow } from "@/features/tags/state/tags";
import type { CreateInfo, TagRowStyle } from "../types";
import styles from "./styles.module.css";

type ItemProps = ComponentPropsWithoutRef<typeof PickerPanel.Item>;

interface GroupProps extends ItemProps {
  group: TagGroupRow;
  open: boolean;
}

function Group({ group, open, ...props }: GroupProps) {
  const style: TagRowStyle = { "--tag-depth": 0 };
  return (
    <PickerPanel.Item
      {...props}
      className={styles.row}
      style={style}
      role="treeitem"
      aria-label={group.name}
      aria-level={1}
      aria-expanded={open}
    >
      <span
        className={styles.expand}
        aria-hidden="true"
        data-expanded={open || undefined}
      >
        <ChevronRight size={12} />
      </span>
      <PickerPanel.ItemLabel title={group.name}>
        {group.name}
      </PickerPanel.ItemLabel>
    </PickerPanel.Item>
  );
}

interface TagProps extends ItemProps {
  tag: TagRow;
  depth: number | undefined;
  nested: boolean;
  applied: boolean;
  mixed: boolean;
  count: number;
  showCount: boolean;
  group: string | undefined;
}

function Tag({
  tag,
  depth,
  nested,
  applied,
  mixed,
  count,
  showCount,
  group,
  ...props
}: TagProps) {
  const style: TagRowStyle | undefined = nested
    ? { "--tag-depth": depth ?? 0 }
    : undefined;
  const selection: PickerSelectionState = mixed
    ? "mixed"
    : applied
      ? "checked"
      : "unchecked";
  return (
    <PickerPanel.Item
      {...props}
      className={nested ? styles.row : undefined}
      style={style}
      role={nested ? "treeitem" : "option"}
      aria-label={mixed ? `${tag.name}, some selected` : tag.name}
      aria-level={nested ? (depth ?? 0) + 1 : undefined}
      aria-selected={applied}
      selected={selection}
    >
      {nested ? <span className={styles.expand} aria-hidden="true" /> : null}
      <PickerPanel.ItemLabel
        title={group ? `${group} / ${tag.name}` : tag.name}
        path={group ? [group] : undefined}
      >
        {tag.name}
      </PickerPanel.ItemLabel>
      {showCount && count > 0 ? (
        <PickerPanel.ItemMeta className={styles.count}>
          {count}
        </PickerPanel.ItemMeta>
      ) : null}
      <PickerPanel.SelectionMark state={selection} />
    </PickerPanel.Item>
  );
}

interface CreateProps extends ItemProps {
  create: CreateInfo;
}

function Create({ create, ...props }: CreateProps) {
  return (
    <PickerPanel.Item
      {...props}
      // oxlint-disable-next-line jsx-a11y/role-has-required-aria-props -- PickerPanel.Item sets aria-selected from `selected`
      role="option"
      selected="unchecked"
      data-create=""
    >
      <PickerPanel.ItemIcon>
        <Plus />
      </PickerPanel.ItemIcon>
      <PickerPanel.ItemLabel title={create.label}>
        {create.kind === "group"
          ? `Create “${create.label}” in “${create.group}”`
          : create.kind === "batch"
            ? `Add ${create.labels.length} Tags`
            : `Create “${create.label}”`}
      </PickerPanel.ItemLabel>
    </PickerPanel.Item>
  );
}

export const TagMenuRow = { Group, Tag, Create };
