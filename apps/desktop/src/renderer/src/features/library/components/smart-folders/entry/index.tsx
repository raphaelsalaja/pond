import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconChevronRight, IconDotsFill } from "@pond/icons";
import type { SavedView } from "@pond/schema/db";
import { Button, cssVars, Menu, type MenuItemSpec, Sidebar } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { useId } from "react";
import { savedViews } from "@/features/library/state/saved-views";
import { InlineNameEditor } from "@/shared/components/inline-name-editor";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { FolderIcon, folderColorCss } from "@/shared/lib/folder-icons";
import type { useOrganizationTree } from "../../../hooks/use-organization-tree";
import { ENTRY_TYPES, entryItems } from "../menu-items";
import type { SmartFolderDrop } from "../reorder";
import { selectionItems } from "../selection-items";
import type { OpenEditor, SavedViewPresentation } from "../types";
import styles from "./styles.module.css";

interface EntryProps {
  organization: ReturnType<typeof useOrganizationTree>;
  view: SavedView;
  views: SavedView[];
  childrenByParent: Map<string | null, SavedView[]>;
  activeId: string | null;
  onSelect: () => void;
  depth: number;
  editingViewId: string | null;
  onFinishRenaming: () => void;
  onStartRenaming: (id: string) => void;
  openEditor: OpenEditor;
  presentations: Record<string, SavedViewPresentation>;
  quickAccessIds: string[];
  drop: SmartFolderDrop | null;
  groupOpen: (id: string) => boolean;
  onGroupOpenChange: (id: string, open: boolean) => void;
}

export function SmartFolderEntry({
  organization,
  view,
  views,
  childrenByParent,
  activeId,
  onSelect,
  depth,
  editingViewId,
  onFinishRenaming,
  onStartRenaming,
  openEditor,
  presentations,
  quickAccessIds,
  drop,
  groupOpen,
  onGroupOpenChange,
}: EntryProps) {
  const open = groupOpen(view.id);
  const childrenId = useId();
  const reduceMotion = useReducedMotionConfig();
  const { activatorEvent } = useDndContext();
  const keyboardDrag = activatorEvent?.type.startsWith("key") ?? false;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: view.id, disabled: editingViewId === view.id });
  const active = activeId === view.id;
  const isGroup = view.kind === "group";
  const renaming = editingViewId === view.id;
  const rowProps = organization.rowProps(
    view.id,
    depth,
    isGroup ? open : undefined,
    () => onGroupOpenChange(view.id, !open),
  );
  const children = childrenByParent.get(view.id) ?? [];
  const { label, icon: Icon } = ENTRY_TYPES[view.kind];
  const presentation = presentations[view.id] ?? {};
  const color = folderColorCss(presentation.color);
  const select = () => {
    savedViews.select(view.id);
    onSelect();
  };
  const selectedCount = views.filter((entry) =>
    organization.selected.includes(entry.id),
  ).length;
  const items = (): MenuItemSpec[] =>
    selectedCount > 1 && organization.selected.includes(view.id)
      ? selectionItems(organization.selected, views)
      : entryItems({
          view,
          views,
          active,
          onSelect: select,
          openEditor,
          onRename: () => onStartRenaming(view.id),
          onStartRenaming,
          onCreated: () => {
            onGroupOpenChange(view.id, true);
            onSelect();
          },
          presentation,
          quickAccessIds,
        });

  return (
    <Sidebar.CollapsibleGroup
      className={styles.branch}
      open={open}
      onOpenChange={(next) => onGroupOpenChange(view.id, next)}
    >
      <SpecContextMenu
        search
        searchLabel="Search Smart Folder operations"
        buildItems={items}
      >
        <div
          className={styles.row}
          data-dragging={isDragging || undefined}
          data-drop={drop?.id === view.id ? drop.kind : undefined}
          data-smart-folder-sortable={view.id}
          ref={setNodeRef}
          style={{
            ...cssVars({ "--entry-depth": depth }),
            transform: CSS.Transform.toString(transform),
            transition: reduceMotion || keyboardDrag ? "none" : transition,
          }}
        >
          {isGroup ? (
            <Button
              icon
              size="xs"
              variant="bare"
              className={styles.disclosure}
              aria-label={`${open ? "Collapse" : "Expand"} ${view.name}`}
              aria-expanded={open}
              aria-controls={childrenId}
              tabIndex={-1}
              onClick={(event) => {
                onGroupOpenChange(view.id, !open);
                event.currentTarget.parentElement
                  ?.querySelector<HTMLElement>('[role="treeitem"]')
                  ?.focus();
              }}
            >
              <IconChevronRight size={12} strokeWidth={2} />
            </Button>
          ) : null}
          {renaming ? (
            <div className={styles.editor}>
              <Sidebar.Icon className={styles.icon}>
                <span style={color ? { color } : undefined}>
                  {presentation.icon ? (
                    <FolderIcon name={presentation.icon} />
                  ) : (
                    <Icon />
                  )}
                </span>
              </Sidebar.Icon>
              <InlineNameEditor
                name={view.name}
                className={styles.field}
                ariaLabel={`${label} name`}
                onSave={(name) => savedViews.rename(view.id, name)}
                onFinish={onFinishRenaming}
              />
            </div>
          ) : (
            <Sidebar.Item
              className={styles.item}
              data-status={
                active || organization.selected.includes(view.id)
                  ? "active"
                  : undefined
              }
              aria-current={active ? "page" : undefined}
              {...attributes}
              {...rowProps}
              {...listeners}
              ref={setActivatorNodeRef}
              onKeyDown={(event) => {
                listeners?.onKeyDown?.(event);
                if (!keyboardDrag && !event.defaultPrevented)
                  rowProps.onKeyDown?.(event);
              }}
            >
              <Sidebar.Icon>
                <span style={color ? { color } : undefined}>
                  {presentation.icon ? (
                    <FolderIcon name={presentation.icon} />
                  ) : (
                    <Icon />
                  )}
                </span>
              </Sidebar.Icon>
              <Sidebar.ItemLabel>{view.name}</Sidebar.ItemLabel>
            </Sidebar.Item>
          )}
          {renaming ? null : (
            <SpecMenu
              search
              searchLabel="Search Smart Folder operations"
              align="end"
              buildItems={items}
            >
              <Menu.Trigger
                icon
                size="xs"
                variant="text"
                className={styles.more}
                aria-label={`More Actions for ${view.name}`}
                tabIndex={-1}
              >
                <IconDotsFill size={12} />
              </Menu.Trigger>
            </SpecMenu>
          )}
        </div>
      </SpecContextMenu>
      {isGroup ? (
        <Sidebar.CollapsibleGroupContent
          id={childrenId}
          inert={!open}
          aria-hidden={!open}
        >
          {children.map((child) => (
            <SmartFolderEntry
              organization={organization}
              key={child.id}
              view={child}
              views={views}
              childrenByParent={childrenByParent}
              activeId={activeId}
              onSelect={onSelect}
              depth={depth + 1}
              editingViewId={editingViewId}
              onFinishRenaming={onFinishRenaming}
              onStartRenaming={onStartRenaming}
              openEditor={openEditor}
              presentations={presentations}
              quickAccessIds={quickAccessIds}
              drop={drop}
              groupOpen={groupOpen}
              onGroupOpenChange={onGroupOpenChange}
            />
          ))}
        </Sidebar.CollapsibleGroupContent>
      ) : null}
    </Sidebar.CollapsibleGroup>
  );
}
