import { DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext } from "@dnd-kit/sortable";
import { IconPlus, IconSortArrows } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { Button, type MenuItemSpec, Sidebar } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { enterFolders } from "@/features/library/operations/enter-folder";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import {
  SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
  SORTABLE_DROP_ANIMATION,
} from "@/shared/lib/dnd-kit";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import { useOrganizationTree } from "../../../hooks/use-organization-tree";
import { useSidebarCounts } from "../../../hooks/use-sidebar-counts";
import { folders, useEditingFolderId } from "../../../state/folders";
import type { LibraryNav } from "../../../state/library-chrome";
import { useIncludeSubfolders } from "../../../state/view-store";
import { folderIdsForExport } from "../../folder-context-menu";
import { FolderCustomizeDialog } from "../../folder-customize-dialog";
import { FolderToolsDialog } from "../../folder-tools";
import { FOLDER_ROOT_DROP_ID } from "../folder-drop";
import type { FolderListSort } from "../tree";
import { FolderTreeRow } from "../tree-row";
import { useFolderDragDrop } from "../use-folder-drag-drop";
import {
  useFolderTreeState,
  useRevealFolderDrop,
} from "../use-folder-tree-state";
import { FolderDragPreview } from "./drag-preview";
import { folderCollisionDetection, staticFolderSorting } from "./folder-dnd";
import { QuickAccess } from "./quick-access";
import { quickAccessRows } from "./quick-access/order";
import { FolderRootDrop } from "./root-drop";
import styles from "./styles.module.css";
import { useFolderTreeActions } from "./use-folder-tree-actions";
import { useFolderTreeDrag } from "./use-folder-tree-drag";

interface FolderTreeProps {
  destination: LibraryNav | null;
  folderRows: Folder[];
  nav: LibraryNav;
}

const FOLDER_SORT_OPTIONS: Array<{
  value: FolderListSort;
  label: string;
}> = [
  { value: "manual", label: "Custom Order" },
  { value: "createdAt", label: "Date Added" },
  { value: "title", label: "Title" },
];

function folderGroupMenuItems(
  sort: FolderListSort,
  onSort: (sort: FolderListSort) => void,
): MenuItemSpec[] {
  return [
    {
      type: "submenu",
      label: "Sort By",
      icon: <IconSortArrows />,
      items: FOLDER_SORT_OPTIONS.map((option) => ({
        type: "checkbox",
        label: option.label,
        checked: sort === option.value,
        onCheckedChange: () => onSort(option.value),
      })),
    },
  ];
}

export function FolderTree({ destination, folderRows, nav }: FolderTreeProps) {
  const editingFolderId = useEditingFolderId();
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [folderViews] = usePrefs("folderViews");
  const [sidebar] = usePrefs("sidebar");
  const includeSubfolders = useIncludeSubfolders();
  const {
    folderTool,
    setFolderTool,
    customizingFolderId,
    setCustomizingFolderId,
    creatingFolder,
    createFolder,
    selectionItems,
  } = useFolderTreeActions({
    folderRows,
    includeSubfolders,
    onCreateStart: () => setFoldersOpen(true),
  });
  const counts = useSidebarCounts();
  const tree = useFolderTreeState(folderRows);
  const reduceMotion = useReducedMotionConfig();
  function openSelectedFolders(ids: string[]) {
    enterFolders(ids, includeSubfolders);
  }
  const organization = useOrganizationTree(
    folderRows,
    openSelectedFolders,
    destination,
  );
  const drag = useFolderDragDrop({
    selectedIds: organization.selected,
    folderRows,
    revealFolder: tree.revealFolder,
  });
  useRevealFolderDrop(drag.folderDrop, tree.revealFolder);
  const treeDrag = useFolderTreeDrag({
    drag,
    folderRows,
    visibleRows: tree.nested.map(({ folder }) => folder),
  });
  const activeFolderId = treeDrag.activeFolderId;
  const activeFolder = activeFolderId
    ? folderRows.find((folder) => folder.id === activeFolderId)
    : undefined;
  const activeFolderDepth = activeFolderId
    ? tree.nested.find(({ folder }) => folder.id === activeFolderId)?.depth
    : undefined;
  const activeFolderPresentation = activeFolder
    ? folderViews[activeFolder.id]
    : undefined;
  const activeFolderHasChildren = activeFolder
    ? tree.parentIds.has(activeFolder.id)
    : false;
  const activeFolderCount = activeFolder
    ? (counts.folders[activeFolder.id] ?? 0)
    : 0;

  // The inline editor mounts on the folder row, so a collapsed ancestor
  // has to open before that row can be named.
  useEffect(() => {
    if (!editingFolderId) return;
    setFoldersOpen(true);
    const parentId = folders
      .snapshot()
      .find((folder) => folder.id === editingFolderId)?.parentId;
    if (parentId) tree.revealFolder(parentId);
  }, [editingFolderId, tree.revealFolder]);
  useRevealSidebarSection("folders", editingFolderId !== null);

  const customizingFolder = customizingFolderId
    ? folderRows.find((folder) => folder.id === customizingFolderId)
    : undefined;
  const quickFolders = quickAccessRows(folderRows, folderViews);

  return (
    <>
      <QuickAccess
        folderRows={folderRows}
        quickFolders={quickFolders}
        folderViews={folderViews}
        folderCounts={counts.folders}
        folderDownloading={counts.foldersDownloading}
        badgeStyle={sidebar.badgeStyle}
        includeSubfolders={includeSubfolders}
        destination={destination}
      />
      {sidebar.sections.folders ? (
        <Sidebar.CollapsibleGroup
          className={styles.group}
          open={foldersOpen}
          onOpenChange={setFoldersOpen}
        >
          <SidebarSectionMenu
            section="folders"
            buildItems={() => folderGroupMenuItems(tree.sort, tree.setSort)}
          >
            <Sidebar.GroupHeader>
              <Sidebar.CollapsibleGroupLabel>
                Folders
              </Sidebar.CollapsibleGroupLabel>
              {organization.selected.length > 1 ? (
                <Sidebar.Count aria-live="polite">
                  {`${formatNumber(organization.selected.length)} selected`}
                </Sidebar.Count>
              ) : null}
              <Button
                icon
                size="sm"
                variant="ghost"
                aria-label="New Folder"
                disabled={creatingFolder}
                onClick={() => void createFolder()}
              >
                <IconPlus />
              </Button>
            </Sidebar.GroupHeader>
          </SidebarSectionMenu>
          <DndContext
            accessibility={{
              screenReaderInstructions:
                SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
              announcements: treeDrag.announcements,
            }}
            collisionDetection={folderCollisionDetection}
            modifiers={[restrictToVerticalAxis]}
            sensors={treeDrag.sensors}
            {...treeDrag.handlers}
          >
            <SortableContext
              items={tree.nested.map(({ folder }) => folder.id)}
              strategy={staticFolderSorting}
            >
              <Sidebar.CollapsibleGroupContent
                ref={organization.root}
                role="tree"
                aria-label="Folders"
                aria-multiselectable
                inert={!foldersOpen}
                aria-hidden={!foldersOpen}
                data-folder-drag={activeFolderId || undefined}
                onPointerDownCapture={treeDrag.trackPointer}
              >
                {tree.nested.map(({ folder, depth }) => {
                  const viewing =
                    destination?.kind === "folder" &&
                    destination.id === folder.id;
                  const presentation = folderViews[folder.id];
                  const includeThisFolder = viewing
                    ? includeSubfolders
                    : (presentation?.includeSubfolders ?? true);
                  return (
                    <FolderTreeRow
                      key={folder.id}
                      rowProps={organization.rowProps(
                        folder.id,
                        depth,
                        tree.parentIds.has(folder.id)
                          ? !tree.collapsed.has(folder.id)
                          : undefined,
                        () => tree.toggleFolder(folder.id),
                      )}
                      selectionItems={
                        organization.selected.includes(folder.id) &&
                        organization.selected.length > 1
                          ? () => selectionItems(organization.selected)
                          : undefined
                      }
                      collapsed={tree.collapsed.has(folder.id)}
                      count={counts.folders[folder.id] ?? 0}
                      downloading={counts.foldersDownloading[folder.id] ?? 0}
                      badgeStyle={sidebar.badgeStyle}
                      creating={creatingFolder}
                      depth={depth}
                      editing={editingFolderId === folder.id}
                      exportIds={folderIdsForExport(
                        folder.id,
                        folderRows,
                        includeThisFolder,
                      )}
                      folder={folder}
                      folderDrop={drag.folderDrop}
                      folderIcon={presentation?.icon}
                      folderSortDir={presentation?.sortDir ?? "desc"}
                      folderSortKey={presentation?.sortKey ?? "savedAt"}
                      hasChildren={tree.parentIds.has(folder.id)}
                      includeSubfolders={includeThisFolder}
                      nav={nav}
                      quickAccess={presentation?.quickAccess ?? false}
                      quickAccessFolderIds={quickFolders.map(
                        (entry) => entry.id,
                      )}
                      sameLevelHasChildren={folderRows.some(
                        (row) =>
                          row.parentId === folder.parentId &&
                          tree.parentIds.has(row.id),
                      )}
                      viewing={viewing}
                      dragHandlers={drag.handlersFor(folder)}
                      dragging={
                        activeFolderId === folder.id ||
                        treeDrag.movingFolderId === folder.id
                      }
                      coverSaveId={presentation?.coverSaveId}
                      onCreateFolder={(parentId) => void createFolder(parentId)}
                      onCustomize={() => setCustomizingFolderId(folder.id)}
                      onFinishEditing={() => folders.finishEditing(folder.id)}
                      onOpenTool={setFolderTool}
                      onStartEditing={folders.startEditing}
                      onToggleAll={tree.toggleAllFolders}
                      onToggleFolder={() => tree.toggleFolder(folder.id)}
                      doubleClickBehavior={sidebar.doubleClickBehavior}
                      onToggleSameLevel={(expanded) =>
                        tree.toggleSameLevel(folder.parentId, expanded)
                      }
                    />
                  );
                })}
              </Sidebar.CollapsibleGroupContent>
            </SortableContext>
            <FolderRootDrop
              target={drag.folderDrop?.id === FOLDER_ROOT_DROP_ID}
            />
            {createPortal(
              <DragOverlay
                dropAnimation={
                  reduceMotion ||
                  treeDrag.keyboardDrag ||
                  treeDrag.movingFolderId
                    ? null
                    : SORTABLE_DROP_ANIMATION
                }
                modifiers={[restrictToVerticalAxis]}
              >
                {activeFolder ? (
                  <FolderDragPreview
                    folder={activeFolder}
                    presentation={activeFolderPresentation}
                    status={
                      organization.selected.includes(activeFolder.id) &&
                      organization.selected.length > 1
                        ? formatPlural(organization.selected.length, {
                            one: "folder",
                            other: "folders",
                          })
                        : undefined
                    }
                    active={
                      destination?.kind === "folder" &&
                      destination.id === activeFolder.id
                    }
                    badgeStyle={sidebar.badgeStyle}
                    count={
                      activeFolderCount > 0 &&
                      (tree.collapsed.has(activeFolder.id) ||
                        !activeFolderHasChildren)
                        ? activeFolderCount
                        : undefined
                    }
                    depth={activeFolderDepth}
                  />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </Sidebar.CollapsibleGroup>
      ) : null}
      {folderTool ? (
        <FolderToolsDialog
          tool={folderTool}
          key={`${folderTool.kind}:${folderTool.id}`}
          onClose={() => setFolderTool(null)}
        />
      ) : null}
      {customizingFolder ? (
        <FolderCustomizeDialog
          key={customizingFolder.id}
          folder={customizingFolder}
          folderIcon={folderViews[customizingFolder.id]?.icon}
          onClose={() => setCustomizingFolderId(null)}
        />
      ) : null}
    </>
  );
}
