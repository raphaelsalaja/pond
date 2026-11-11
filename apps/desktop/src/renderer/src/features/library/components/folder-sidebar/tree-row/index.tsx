import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconChevronRight } from "@pond/icons";
import type { Folder, SidebarBadgeStyle } from "@pond/schema/db";
import { Button, cssVars, type MenuItemSpec } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { FolderContextMenu } from "@/features/library/components/folder-context-menu";
import type { FolderTool } from "@/features/library/components/folder-tools";
import { enterFolder } from "@/features/library/operations/enter-folder";
import { folders } from "@/features/library/state/folders";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import { type FolderIconId, folderColorCss } from "@/shared/lib/folder-icons";
import { formatPlural } from "@/shared/lib/format";
import { FolderCover } from "../cover";
import { buildFolderRowMenuItems } from "../folder-row-menu";
import { FolderNameEditor } from "../name-editor";
import { Row } from "../sidebar-row";
import type {
  FolderDropState,
  useFolderDragDrop,
} from "../use-folder-drag-drop";
import styles from "./styles.module.css";

type FolderDragHandlers = ReturnType<
  ReturnType<typeof useFolderDragDrop>["handlersFor"]
>;

interface FolderTreeRowProps {
  rowProps?: Omit<React.ComponentPropsWithoutRef<typeof Row>, "label">;
  selectionItems?: () => MenuItemSpec[];
  badgeStyle: SidebarBadgeStyle;
  collapsed: boolean;
  count: number;
  downloading: number;
  coverSaveId?: string | null;
  creating: boolean;
  depth: number;
  doubleClickBehavior: "open" | "expand-collapse";
  editing: boolean;
  exportIds: string[];
  folder: Folder;
  folderDrop: FolderDropState | null;
  folderIcon?: FolderIconId;
  folderSortDir: "asc" | "desc";
  folderSortKey: string;
  hasChildren: boolean;
  includeSubfolders: boolean;
  dragging: boolean;
  nav: LibraryNav;
  quickAccess: boolean;
  quickAccessFolderIds: string[];
  sameLevelHasChildren: boolean;
  viewing: boolean;
  dragHandlers: FolderDragHandlers;
  onCreateFolder: (parentId?: string) => void;
  onCustomize: () => void;
  onFinishEditing: () => void;
  onOpenTool: (tool: FolderTool) => void;
  onStartEditing: (id: string) => void;
  onToggleAll: () => void;
  onToggleFolder: () => void;
  onToggleSameLevel: (expanded: boolean) => void;
}

export function FolderTreeRow(props: FolderTreeRowProps) {
  const { folder } = props;
  const reduceMotion = useReducedMotionConfig();
  const { activatorEvent } = useDndContext();
  const keyboardDrag = activatorEvent?.type.startsWith("key") ?? false;
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: folder.id, disabled: props.editing });
  const colorCss = folderColorCss(folder.color);
  const showsBadge = props.collapsed || !props.hasChildren;
  const count = props.count > 0 && showsBadge ? props.count : undefined;
  const saveDropCount =
    props.folderDrop?.id === folder.id ? props.folderDrop.saveCount : undefined;
  const saveDropLabel = saveDropCount
    ? `Add ${formatPlural(saveDropCount, { one: "Save", other: "Saves" })}`
    : undefined;
  return (
    <FolderContextMenu
      buildItems={() =>
        props.selectionItems?.() ??
        buildFolderRowMenuItems({
          collapsed: props.collapsed,
          creating: props.creating,
          exportIds: props.exportIds,
          folder,
          folderIcon: props.folderIcon,
          folderSortDir: props.folderSortDir,
          folderSortKey: props.folderSortKey,
          hasChildren: props.hasChildren,
          includeSubfolders: props.includeSubfolders,
          nav: props.nav,
          quickAccess: props.quickAccess,
          quickAccessFolderIds: props.quickAccessFolderIds,
          sameLevelHasChildren: props.sameLevelHasChildren,
          viewing: props.viewing,
          onCreateFolder: props.onCreateFolder,
          onCustomize: props.onCustomize,
          onOpenTool: props.onOpenTool,
          onStartEditing: props.onStartEditing,
          onToggleAll: props.onToggleAll,
          onToggleFolder: props.onToggleFolder,
          onToggleSameLevel: props.onToggleSameLevel,
        })
      }
    >
      <div
        className={styles.trigger}
        data-folder-sortable={folder.id}
        data-drop={
          props.folderDrop?.id === folder.id ? props.folderDrop.kind : undefined
        }
        data-dragging={props.dragging || undefined}
        ref={setNodeRef}
        style={{
          ...cssVars({ "--folder-depth": props.depth }),
          transform: CSS.Transform.toString(transform),
          transition: reduceMotion || keyboardDrag ? "none" : transition,
        }}
      >
        {props.hasChildren ? (
          <Button
            icon
            size="xs"
            variant="bare"
            className={styles.disclosure}
            aria-label={`${props.collapsed ? "Expand" : "Collapse"} ${folder.name}`}
            aria-expanded={!props.collapsed}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleFolder();
              event.currentTarget.parentElement
                ?.querySelector<HTMLElement>('[role="treeitem"]')
                ?.focus();
            }}
          >
            <IconChevronRight size={12} strokeWidth={2} />
          </Button>
        ) : null}
        {props.editing ? (
          <FolderNameEditor
            name={folder.name}
            onSave={async (name) => {
              const result = await window.pond.query("folders.rename", {
                id: folder.id,
                name,
              });
              if (!result.ok) throw new Error("Couldn't rename folder");
              await folders.refresh();
            }}
            onFinish={props.onFinishEditing}
          />
        ) : (
          <Row
            {...attributes}
            label={folder.name}
            className={styles.row}
            icon={
              <span style={colorCss ? { color: colorCss } : undefined}>
                <FolderCover
                  icon={props.folderIcon}
                  coverSaveId={props.coverSaveId}
                />
              </span>
            }
            depth={props.depth}
            count={count}
            downloading={showsBadge ? props.downloading : 0}
            badgeStyle={props.badgeStyle}
            status={saveDropLabel}
            active={props.viewing}
            ref={setActivatorNodeRef}
            onDoubleClick={(event) => {
              if (
                props.doubleClickBehavior !== "expand-collapse" ||
                !props.hasChildren
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              props.onToggleFolder();
            }}
            onClick={() => {
              enterFolder(folder.id);
            }}
            {...props.rowProps}
            {...props.dragHandlers}
            {...listeners}
            onKeyDown={(event) => {
              listeners?.onKeyDown?.(event);
              if (!keyboardDrag && !event.defaultPrevented) {
                props.rowProps?.onKeyDown?.(event);
              }
            }}
          />
        )}
      </div>
    </FolderContextMenu>
  );
}
