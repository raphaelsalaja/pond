import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { IconPlus, IconSortArrows } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { Button, type MenuItemSpec, Sidebar } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enterFolders } from "@/features/library/operations/enter-folder";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import {
  SIDEBAR_SORTABLE_KEYBOARD_CODES,
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
import type { FolderListSort } from "../tree";
import { FolderTreeRow } from "../tree-row";
import { useFolderDragDrop } from "../use-folder-drag-drop";
import {
  useFolderTreeState,
  useRevealFolderDrop,
} from "../use-folder-tree-state";
import { FolderDragPreview } from "./drag-preview";
import { dndFolderDropKind, folderDndAnnouncements } from "./folder-dnd";
import { QuickAccess } from "./quick-access";
import { quickAccessRows } from "./quick-access/order";
import { useFolderTreeActions } from "./use-folder-tree-actions";

interface FolderTreeProps {
  folderRows: Folder[];
  libraryPage: boolean;
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

export function FolderTree({ folderRows, libraryPage, nav }: FolderTreeProps) {
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
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState(false);
  const pointerStartY = useRef<number | null>(null);
  const pointerY = useRef<number | null>(null);
  const reduceMotion = useReducedMotionConfig();
  const folderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SIDEBAR_SORTABLE_KEYBOARD_CODES,
    }),
  );
  function openSelectedFolders(ids: string[]) {
    enterFolders(ids, includeSubfolders);
  }
  const organization = useOrganizationTree(
    folderRows,
    openSelectedFolders,
    nav,
  );
  const drag = useFolderDragDrop({
    selectedIds: organization.selected,
    folderRows,
    revealFolder: tree.revealFolder,
  });
  useRevealFolderDrop(drag.folderDrop, tree.revealFolder);
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

  useEffect(() => {
    if (editingFolderId) setFoldersOpen(true);
  }, [editingFolderId]);
  useRevealSidebarSection("folders", editingFolderId !== null);

  function previewFolderDrop({ active, over }: DragOverEvent): void {
    if (!over) {
      drag.clearFolderDrop();
      return;
    }
    const target = folderRows.find((folder) => folder.id === over.id);
    if (!target) {
      drag.clearFolderDrop();
      return;
    }
    drag.previewFolderMove(
      String(active.id),
      target,
      dndFolderDropKind(active, over, pointerY.current),
    );
  }

  function finishFolderDrop({ active, over }: DragEndEvent): void {
    setActiveFolderId(null);
    setKeyboardDrag(false);
    drag.clearFolderDrop();
    const finalPointerY = pointerY.current;
    pointerStartY.current = null;
    pointerY.current = null;
    if (!over) return;
    const target = folderRows.find((folder) => folder.id === over.id);
    if (!target) return;
    const kind = dndFolderDropKind(active, over, finalPointerY);
    if (!drag.folderMoveTarget(String(active.id), target, kind)) return;
    void drag.moveFolder(String(active.id), target, kind);
  }
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
        libraryPage={libraryPage}
        nav={nav}
      />
      {sidebar.sections.folders ? (
        <Sidebar.CollapsibleGroup
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
              announcements: folderDndAnnouncements(folderRows, pointerY),
            }}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            sensors={folderSensors}
            onDragStart={({ active, activatorEvent }) => {
              setActiveFolderId(String(active.id));
              setKeyboardDrag(activatorEvent.type.startsWith("key"));
              pointerStartY.current =
                "clientY" in activatorEvent
                  ? Number(activatorEvent.clientY)
                  : null;
              pointerY.current = pointerStartY.current;
            }}
            onDragMove={({ delta }) => {
              pointerY.current =
                pointerStartY.current == null
                  ? null
                  : pointerStartY.current + delta.y;
            }}
            onDragOver={previewFolderDrop}
            onDragCancel={() => {
              setActiveFolderId(null);
              setKeyboardDrag(false);
              drag.clearFolderDrop();
              pointerStartY.current = null;
              pointerY.current = null;
            }}
            onDragEnd={finishFolderDrop}
          >
            <SortableContext
              items={tree.nested.map(({ folder }) => folder.id)}
              strategy={verticalListSortingStrategy}
            >
              <Sidebar.CollapsibleGroupContent
                ref={organization.root}
                role="tree"
                aria-label="Folders"
                aria-multiselectable
                inert={!foldersOpen}
                aria-hidden={!foldersOpen}
                data-folder-drag={activeFolderId || undefined}
              >
                {tree.nested.map(({ folder, depth }) => {
                  const viewing =
                    libraryPage &&
                    nav.kind === "folder" &&
                    nav.id === folder.id;
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
                      dragging={activeFolderId === folder.id}
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
            {createPortal(
              <DragOverlay
                dropAnimation={
                  reduceMotion || keyboardDrag ? null : SORTABLE_DROP_ANIMATION
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
                      libraryPage &&
                      nav.kind === "folder" &&
                      nav.id === activeFolder.id
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
