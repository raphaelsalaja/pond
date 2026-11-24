import { closestCenter, DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { IconPlus } from "@pond/icons";
import type { SavedView } from "@pond/schema/db";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import { Menu, Sidebar } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useMemo, useState } from "react";
import {
  combineQueries,
  inheritedQueryFor,
} from "@/features/library/lib/smart-folders";
import { enterAll } from "@/features/library/operations/enter-folder";
import { useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  savedViews,
  useEditingSavedViewId,
  useSavedViewEditorRequest,
  useSavedViews,
} from "@/features/library/state/saved-views";
import { useActiveViewId } from "@/features/library/state/view-store";
import { savesStore } from "@/features/saves/pool";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import { useTagGroups, useTags } from "@/features/tags";
import { SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS } from "@/shared/lib/dnd-kit";
import { usePrefs } from "@/shared/state/prefs";
import { useOrganizationTree } from "../../hooks/use-organization-tree";
import { SmartFolderEntry } from "./entry";
import { creationItems, quickAccessIdsFor } from "./menu-items";
import { smartFolderRows, smartFolderSortableIds } from "./reorder";
import { RuleDialog } from "./rule-dialog";
import { newRule } from "./rule-editor";
import { ruleChoices } from "./rule-editor/choices";
import type { EditorRequest } from "./types";
import { useSmartFolderDrag } from "./use-smart-folder-drag";

async function countMatches(query: Query): Promise<number> {
  const result = await window.pond.query("saves.queryCount", { query });
  return result.count;
}

export function SmartFoldersSection({ active = true }: { active?: boolean }) {
  const views = useSavedViews();
  const destination = useLibraryNav();
  const activeViewId = useActiveViewId();
  const [presentations] = usePrefs("savedViewViews");
  const [sidebar] = usePrefs("sidebar");
  const [open, setOpen] = useState(true);
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setGroupOpen = (id: string, next: boolean) => {
    setClosedGroups((current) => {
      if (current.has(id) === !next) {
        return current;
      }
      const groups = new Set(current);
      if (next) {
        groups.delete(id);
      } else {
        groups.add(id);
      }
      return groups;
    });
  };
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const editingViewId = useEditingSavedViewId();
  useRevealSidebarSection("smartFolders", editingViewId !== null);
  const editorRequest = useSavedViewEditorRequest();
  const [handledEditorToken, setHandledEditorToken] = useState(0);
  if (editorRequest.token !== 0 && editorRequest.token !== handledEditorToken) {
    setHandledEditorToken(editorRequest.token);
    if (editorRequest.mode === "edit") {
      const view = views.find((entry) => entry.id === editorRequest.viewId);
      if (view) {
        setEditor({ mode: "edit", view });
      }
    } else {
      setOpen(true);
      setEditor({
        mode: "create",
        kind: editorRequest.kind,
        parentId: editorRequest.parentId,
      });
    }
  }
  const childrenByParent = useMemo(() => {
    const groups = new Set(
      views.filter((view) => view.kind === "group").map((view) => view.id),
    );
    const children = new Map<string | null, Array<SavedView>>();
    for (const view of views) {
      const parentId =
        view.parentId && groups.has(view.parentId) ? view.parentId : null;
      const siblings = children.get(parentId) ?? [];
      siblings.push(view);
      children.set(parentId, siblings);
    }
    return children;
  }, [views]);
  const { root: treeRoot, ...organization } = useOrganizationTree(
    views,
    (ids) => {
      if (ids.length === 1 && ids[0]) {
        savedViews.select(ids[0]);
      } else if (ids.length > 1) {
        enterAll({
          combinator: "or",
          rules: views
            .filter((view) => ids.includes(view.id))
            .map((view) =>
              combineQueries([inheritedQueryFor(view, views), view.query]),
            ),
        });
      }
    },
    destination,
  );
  const rows = useMemo(
    () => smartFolderRows(childrenByParent),
    [childrenByParent],
  );
  const sortableIds = useMemo(
    () => smartFolderSortableIds(childrenByParent),
    [childrenByParent],
  );
  const drag = useSmartFolderDrag({
    views,
    rows,
    selectedIds: organization.selected,
    onReveal: (id) => setGroupOpen(id, true),
  });
  const quickAccessIds = quickAccessIdsFor(views, presentations);
  const items = () =>
    creationItems(
      null,
      () => setOpen(true),
      setEditor,
      (id) => savedViews.startEditing(id),
    );

  const editorDialog = editor ? (
    <SmartFolderEditor
      request={editor}
      views={views}
      onClose={() => setEditor(null)}
    />
  ) : null;

  if (!sidebar.sections.smartFolders) {
    return editorDialog;
  }

  return (
    <>
      <Sidebar.CollapsibleGroup open={open} onOpenChange={setOpen}>
        <SidebarSectionMenu
          section="smartFolders"
          search
          searchLabel="Search Smart Folder operations"
          buildItems={items}
        >
          <Sidebar.GroupHeader>
            <Sidebar.CollapsibleGroupLabel>
              Smart Folders
            </Sidebar.CollapsibleGroupLabel>
            {organization.selected.length > 1 ? (
              <Sidebar.Count aria-live="polite">
                {organization.selected.length} selected
              </Sidebar.Count>
            ) : null}
            <Menu.Root>
              <Menu.Trigger
                icon
                size="sm"
                variant="ghost"
                aria-label="New Smart Folder, Group, or Saved View"
              >
                <IconPlus />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner align="start" side="bottom">
                  <Menu.Popup>
                    <Menu.Items items={items()} />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </Sidebar.GroupHeader>
        </SidebarSectionMenu>
        <DndContext
          accessibility={{
            announcements: drag.announcements,
            screenReaderInstructions:
              SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
          }}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          sensors={drag.sensors}
          onDragCancel={drag.cancel}
          onDragEnd={drag.finish}
          onDragMove={drag.move}
          onDragOver={drag.preview}
          onDragStart={drag.start}
        >
          <SortableContext
            items={sortableIds}
            strategy={verticalListSortingStrategy}
          >
            <Sidebar.CollapsibleGroupContent
              ref={treeRoot}
              role="tree"
              aria-label="Smart Folders"
              aria-multiselectable
              inert={!open}
              aria-hidden={!open}
            >
              {(childrenByParent.get(null) ?? []).map((view) => (
                <SmartFolderEntry
                  organization={organization}
                  key={view.id}
                  view={view}
                  views={views}
                  childrenByParent={childrenByParent}
                  activeId={active ? activeViewId : null}
                  depth={0}
                  editingViewId={editingViewId}
                  onFinishRenaming={() => savedViews.finishEditing()}
                  onStartRenaming={(id) => savedViews.startEditing(id)}
                  openEditor={setEditor}
                  presentations={presentations}
                  quickAccessIds={quickAccessIds}
                  drop={drag.drop}
                  groupOpen={(id) => !closedGroups.has(id)}
                  onGroupOpenChange={setGroupOpen}
                />
              ))}
            </Sidebar.CollapsibleGroupContent>
          </SortableContext>
        </DndContext>
        {open && views.length === 0 ? (
          <Sidebar.Item
            onClick={() =>
              setEditor({
                mode: "create",
                kind: "smart_folder",
                parentId: null,
              })
            }
          >
            <Sidebar.Icon>
              <IconPlus />
            </Sidebar.Icon>
            <Sidebar.ItemLabel>New Smart Folder</Sidebar.ItemLabel>
          </Sidebar.Item>
        ) : null}
      </Sidebar.CollapsibleGroup>
      {editorDialog}
    </>
  );
}
function SmartFolderEditor({
  request,
  views,
  onClose,
}: {
  request: EditorRequest;
  views: Array<SavedView>;
  onClose: () => void;
}) {
  const libraryRevision = useSelector(savesStore, (state) => state.revision);
  const folders = useFolders();
  const tags = useTags();
  const tagGroups = useTagGroups();
  const view = request.mode === "edit" ? request.view : null;
  const parentId =
    request.mode === "edit" ? request.view.parentId : request.parentId;
  const parent = views.find((entry) => entry.id === parentId);
  const inheritedQuery = useMemo(
    () =>
      parent
        ? combineQueries([inheritedQueryFor(parent, views), parent.query])
        : EMPTY_QUERY,
    [parent, views],
  );
  const initialQuery = useMemo<Query>(
    () => view?.query ?? { combinator: "or", rules: [newRule()] },
    [view],
  );
  return (
    <RuleDialog
      libraryRevision={libraryRevision}
      kind={
        view?.kind === "group" ||
        (request.mode === "create" && request.kind === "group")
          ? "group"
          : "smart_folder"
      }
      name={view?.name}
      editing={request.mode === "edit"}
      query={initialQuery}
      inheritedQuery={inheritedQuery}
      parentName={parent?.name}
      choices={ruleChoices({ folders, tags, tagGroups })}
      count={countMatches}
      onClose={onClose}
      onSave={async (name, query) => {
        if (request.mode === "edit") {
          await savedViews.edit(request.view.id, name, query);
        } else {
          await savedViews.create({
            name,
            query,
            kind: request.kind,
            parentId: request.parentId,
          });
          request.onSaved?.();
        }
      }}
    />
  );
}
