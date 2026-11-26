import {
  IconArrowRight as ArrowRight,
  IconBarsFilter as Filter,
  IconCopy as Copy,
  IconFolder as Folder,
  IconMerge as Merge,
  IconPencil as Pencil,
  IconMinus as RemoveFromGroup,
  IconStarMinus as StarMinus,
  IconStarPlus as StarPlus,
  IconTag as Tags,
  IconTrash as Trash,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import type { ReactElement } from "react";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";

export interface TagMenuActions {
  name: string;
  groups: Array<string>;
  mergeTargets: Array<string>;
  inGroup: string | null;
  starred: boolean;
  onFilter: () => void;
  onSetStarred: (starred: boolean) => void;
  onAddToGroup: (group: string) => void;
  onMoveToGroup: (group: string) => void;
  onRemoveFromGroup: () => void;
  onMerge: (tag: string) => void;
  onRename: () => void;
  onRemove: () => void;
}

function copyTagName(name: string): void {
  void window.pond
    .query("clipboard.writeText", { text: name })
    .then(() => notify({ id: "copy-tag-name", title: "Tag name copied" }));
}

function groupItems(
  groups: Array<string>,
  onSelect: (group: string) => void,
): Array<MenuItemSpec> {
  return groups.map((group) => ({
    label: group,
    icon: <Folder />,
    onClick: () => onSelect(group),
  }));
}

export function buildTagMenuItems(a: TagMenuActions): Array<MenuItemSpec> {
  const targets = a.groups.filter((group) => group !== a.inGroup);

  return [
    {
      label: "Filter Items with the Tag(s)",
      icon: <Filter />,
      onClick: a.onFilter,
    },
    { type: "separator" },
    {
      label: "Add to Starred",
      icon: <StarPlus />,
      disabled: a.starred,
      onClick: () => a.onSetStarred(true),
    },
    {
      label: "Remove from Starred",
      icon: <StarMinus />,
      disabled: !a.starred,
      onClick: () => a.onSetStarred(false),
    },
    {
      label: "Rename Tag",
      icon: <Pencil />,
      shortcut: shortcutGlyphs("tags.rename"),
      onClick: a.onRename,
    },
    {
      label: "Copy Tag Name",
      icon: <Copy />,
      onClick: () => copyTagName(a.name),
    },
    {
      type: "submenu",
      label: "Merge Into",
      icon: <Merge />,
      disabled: a.mergeTargets.length === 0,
      items: a.mergeTargets.map((tag) => ({
        label: tag,
        icon: <Tags />,
        onClick: () => a.onMerge(tag),
      })),
    },
    { type: "separator" },
    {
      type: "submenu",
      label: "Add to Group",
      icon: <Folder />,
      disabled: targets.length === 0,
      items: groupItems(targets, a.onAddToGroup),
    },
    {
      type: "submenu",
      label: "Move to Group",
      icon: <ArrowRight />,
      disabled: !a.inGroup || targets.length === 0,
      items: groupItems(targets, a.onMoveToGroup),
    },
    {
      label: "Remove from this Group",
      icon: <RemoveFromGroup />,
      disabled: !a.inGroup,
      onClick: a.onRemoveFromGroup,
    },
    { type: "separator" },
    {
      label: "Remove Tag",
      icon: <Trash />,
      variant: "destructive",
      onClick: a.onRemove,
    },
  ];
}

export function TagContextMenu({
  buildItems,
  children,
}: {
  buildItems: () => Array<MenuItemSpec>;
  children: ReactElement;
}) {
  return (
    <SpecContextMenu
      search
      searchLabel="Search tag operations"
      minWidth="292px"
      buildItems={buildItems}
    >
      {children}
    </SpecContextMenu>
  );
}
