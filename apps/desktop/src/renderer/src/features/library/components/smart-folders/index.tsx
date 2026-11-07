import { IconPlus } from "@pond/icons";
import type { SavedView } from "@pond/schema/db";
import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import { Menu, Sidebar } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  combineQueries,
  inheritedQueryFor,
} from "@/features/library/lib/smart-folders";
import { useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  savedViews,
  useEditingSavedViewId,
  useSavedViewEditorRequest,
  useSavedViews,
} from "@/features/library/state/saved-views";
import { useViewStore } from "@/features/library/state/view-store";
import { savesStore } from "@/features/saves/pool";
import {
  SidebarSectionMenu,
  useRevealSidebarSection,
} from "@/features/settings";
import { useTags } from "@/features/tags";
import { usePrefs } from "@/shared/state/prefs";
import { useOrganizationTree } from "../../hooks/use-organization-tree";
import { resetFilters, setQuery } from "../../state/view-store";
import { selectLibraryNav } from "../folder-sidebar/navigation";
import { SmartFolderEntry } from "./entry";
import { creationItems } from "./menu-items";
import { RuleDialog } from "./rule-dialog";
import { newRule } from "./rule-editor";
import type { EditorRequest } from "./types";

async function countMatches(query: Query): Promise<number> {
  const result = await window.pond.query("saves.queryCount", { query });
  return result.count;
}

export function SmartFoldersSection({
  onSelect,
  active = true,
}: {
  onSelect: () => void;
  active?: boolean;
}) {
  const views = useSavedViews();
  const nav = useLibraryNav();
  const { activeViewId } = useViewStore();
  const [presentations] = usePrefs("savedViewViews");
  const [sidebar] = usePrefs("sidebar");
  const [open, setOpen] = useState(true);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const editingViewId = useEditingSavedViewId();
  useRevealSidebarSection("smartFolders", editingViewId !== null);
  const editorRequest = useSavedViewEditorRequest();
  const handledEditorRequest = useRef(0);
  useEffect(() => {
    if (
      editorRequest.token === 0 ||
      editorRequest.token === handledEditorRequest.current
    )
      return;
    handledEditorRequest.current = editorRequest.token;
    setOpen(true);
    setEditor({
      mode: "create",
      kind: editorRequest.kind,
      parentId: editorRequest.parentId,
      onSaved: onSelect,
    });
  }, [editorRequest, onSelect]);
  const childrenByParent = useMemo(() => {
    const groups = new Set(
      views.filter((view) => view.kind === "group").map((view) => view.id),
    );
    const children = new Map<string | null, SavedView[]>();
    for (const view of views) {
      const parentId =
        view.parentId && groups.has(view.parentId) ? view.parentId : null;
      const siblings = children.get(parentId) ?? [];
      siblings.push(view);
      children.set(parentId, siblings);
    }
    return children;
  }, [views]);
  const organization = useOrganizationTree(
    views,
    (ids) => {
      if (ids.length === 1 && ids[0]) {
        savedViews.select(ids[0]);
        onSelect();
      } else if (ids.length > 1) {
        resetFilters();
        selectLibraryNav({ kind: "all" });
        setQuery({
          combinator: "or",
          rules: views
            .filter((view) => ids.includes(view.id))
            .map((view) =>
              combineQueries([inheritedQueryFor(view, views), view.query]),
            ),
        });
        onSelect();
      }
    },
    nav,
  );
  const quickAccessIds = views
    .filter((view) => presentations[view.id]?.quickAccess)
    .toSorted(
      (left, right) =>
        (presentations[left.id]?.quickAccessOrder ?? Number.MAX_SAFE_INTEGER) -
          (presentations[right.id]?.quickAccessOrder ??
            Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    )
    .map((view) => view.id);
  const items = () =>
    creationItems(
      null,
      () => {
        setOpen(true);
        onSelect();
      },
      setEditor,
      savedViews.startEditing,
    );

  const editorDialog = editor ? (
    <SmartFolderEditor
      request={editor}
      views={views}
      onClose={() => setEditor(null)}
    />
  ) : null;

  if (!sidebar.sections.smartFolders) return editorDialog;

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
        <Sidebar.CollapsibleGroupContent
          ref={organization.root}
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
              onSelect={onSelect}
              depth={0}
              editingViewId={editingViewId}
              onFinishRenaming={() => savedViews.finishEditing()}
              onStartRenaming={savedViews.startEditing}
              openEditor={setEditor}
              presentations={presentations}
              quickAccessIds={quickAccessIds}
            />
          ))}
        </Sidebar.CollapsibleGroupContent>
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
  views: SavedView[];
  onClose: () => void;
}) {
  const libraryRevision = useSelector(savesStore, (state) => state.revision);
  const folders = useFolders();
  const tags = useTags();
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
      choices={{
        folders: folders.map((folder) => ({
          value: folder.id,
          label: folder.name,
        })),
        tags: tags.map((tag) => ({ value: tag.name, label: tag.name })),
      }}
      count={countMatches}
      onClose={onClose}
      onSave={async (name, query) => {
        if (request.mode === "edit")
          await savedViews.edit(request.view.id, name, query);
        else {
          await savedViews.create({
            name,
            query,
            kind: request.kind,
            parentId: request.parentId,
          });
          request.onSaved();
        }
      }}
    />
  );
}
