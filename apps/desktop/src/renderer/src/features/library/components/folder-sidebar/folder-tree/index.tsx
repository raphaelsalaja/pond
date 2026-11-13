import { DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext } from "@dnd-kit/sortable";
import { IconPlus, IconSortArrows } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { Button, type MenuItemSpec, Sidebar } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { FOLDER_ROW_SLOT, useVirtualWindow } from "./use-virtual-window";

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
  // Reference-stable ordered id list: dnd-kit derives per-node data from the
  // SortableContext `items` array, and the tree's keyboard navigation walks
  // it (instead of querying the DOM), so arrow keys, End, and typeahead work
  // across rows that are not currently mounted. `tree.nested` only changes
  // reference when its content changes, which is exactly when the ids must.
  const orderedFolderIds = useMemo(
    () => tree.nested.map(({ folder }) => folder.id),
    [tree.nested],
  );
  // O(1) id -> position lookups for keyboard navigation and the virtual
  // window, instead of an O(N) scan per row.
  const indexOfRow = useMemo(() => {
    const indexById = new Map<string, number>();
    for (const [index, { folder }] of tree.nested.entries())
      indexById.set(folder.id, index);
    return (id: string) => indexById.get(id);
  }, [tree.nested]);
  const folderById = useMemo(
    () => new Map(folderRows.map((folder) => [folder.id, folder])),
    [folderRows],
  );
  const organization = useOrganizationTree(
    folderRows,
    openSelectedFolders,
    destination,
    orderedFolderIds,
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
    ? folderById.get(activeFolderId)
    : undefined;
  const activeFolderDepth = activeFolderId
    ? tree.nested[indexOfRow(activeFolderId) ?? -1]?.depth
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
    ? folderById.get(customizingFolderId)
    : undefined;
  const quickFolders = useMemo(
    () => quickAccessRows(folderRows, folderViews),
    [folderRows, folderViews],
  );
  // One pass over the rows, so each row's "same level" check is a Set lookup
  // instead of an O(N) scan per row (thousands of rows × thousands of rows).
  const parentsWithChildFolders = useMemo(() => {
    const set = new Set<string | null>();
    for (const row of folderRows)
      if (tree.parentIds.has(row.id)) set.add(row.parentId);
    return set;
  }, [folderRows, tree.parentIds]);

  // Rows are memoized, so per-row closures must be reference-stable or the
  // memo can never skip them. These read the latest rows through a ref, so a
  // cached closure is never stale.
  const folderRowsRef = useRef(folderRows);
  folderRowsRef.current = folderRows;
  const exportIdsCache = useRef(
    new Map<string, (include: boolean) => string[]>(),
  );
  if (exportIdsCache.current.size > folderRows.length * 4)
    exportIdsCache.current.clear();
  const exportIdsFor = (id: string) => {
    let fn = exportIdsCache.current.get(id);
    if (!fn) {
      fn = (include: boolean) =>
        folderIdsForExport(id, folderRowsRef.current, include);
      exportIdsCache.current.set(id, fn);
    }
    return fn;
  };
  const dragHandlersCache = useRef(
    new Map<string, ReturnType<(typeof drag)["handlersFor"]>>(),
  );
  if (dragHandlersCache.current.size > folderRows.length * 2)
    dragHandlersCache.current.clear();
  const dragHandlersFor = (folder: Folder) => {
    let handlers = dragHandlersCache.current.get(folder.id);
    if (!handlers) {
      handlers = drag.handlersFor(folder);
      dragHandlersCache.current.set(folder.id, handlers);
    }
    return handlers;
  };

  // Reference-stable quick-access id list, keyed by content: the memoized
  // rows compare it by reference.
  const quickIdsKey = useMemo(
    () => quickFolders.map((entry) => entry.id).join("\n"),
    [quickFolders],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by quickIdsKey.
  const quickAccessFolderIds = useMemo(
    () => quickFolders.map((entry) => entry.id),
    [quickIdsKey],
  );

  // The tree can hold thousands of rows, but the sidebar only shows a few
  // dozen at a time. Mounting every row froze startup and turned each
  // dnd-kit re-measure (scroll, occlusion, re-sort) into a multi-second
  // cascade. Only the visible slice plus overscan is mounted — and always
  // the keyboard cursor's row and the dragged row, so focus and dragging
  // can land on rows outside the viewport. The in-flow spacer below keeps
  // the scroll height real.
  const totalRows = tree.nested.length;
  const virtualFocusIds = useMemo(
    () =>
      [organization.cursor, activeFolderId].filter(
        (id): id is string => id !== null && id !== undefined,
      ),
    [organization.cursor, activeFolderId],
  );
  const rowWindow = useVirtualWindow(
    organization.root,
    totalRows,
    virtualFocusIds,
    indexOfRow,
  );

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
              items={orderedFolderIds}
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
                className={styles.panel}
              >
                <div
                  role="none"
                  aria-hidden
                  className={styles.spacer}
                  style={{
                    height: Math.max(0, totalRows * FOLDER_ROW_SLOT - 1),
                  }}
                />
                <div
                  role="none"
                  className={styles.window}
                  style={{
                    transform: `translateY(${rowWindow.first * FOLDER_ROW_SLOT}px)`,
                  }}
                >
                  {tree.nested
                    .slice(rowWindow.first, rowWindow.last)
                    .map(({ folder, depth }) => {
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
                          downloading={
                            counts.foldersDownloading[folder.id] ?? 0
                          }
                          badgeStyle={sidebar.badgeStyle}
                          creating={creatingFolder}
                          depth={depth}
                          editing={editingFolderId === folder.id}
                          // Lazy: resolving descendants is O(N) per folder, so it
                          // must not run for every row on every render; the
                          // cached closure reads the latest rows through a ref.
                          exportIds={exportIdsFor(folder.id)}
                          folder={folder}
                          folderDrop={drag.folderDrop}
                          folderIcon={presentation?.icon}
                          folderSortDir={presentation?.sortDir ?? "desc"}
                          folderSortKey={presentation?.sortKey ?? "savedAt"}
                          hasChildren={tree.parentIds.has(folder.id)}
                          includeSubfolders={includeThisFolder}
                          nav={nav}
                          quickAccess={presentation?.quickAccess ?? false}
                          quickAccessFolderIds={quickAccessFolderIds}
                          sameLevelHasChildren={parentsWithChildFolders.has(
                            folder.parentId,
                          )}
                          viewing={viewing}
                          dragHandlers={dragHandlersFor(folder)}
                          dragging={
                            activeFolderId === folder.id ||
                            treeDrag.movingFolderId === folder.id
                          }
                          coverSaveId={presentation?.coverSaveId}
                          onCreateFolder={(parentId) =>
                            void createFolder(parentId)
                          }
                          onCustomize={() => setCustomizingFolderId(folder.id)}
                          onFinishEditing={() =>
                            folders.finishEditing(folder.id)
                          }
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
                </div>
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
