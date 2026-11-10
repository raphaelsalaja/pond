import type { MenuItemSpec } from "@pond/ui";
import { Dialog } from "@pond/ui";
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  libraryChrome,
  resetFilters,
  selectLibraryNav,
  setQuery,
} from "@/features/library";
import {
  buildTagMenuItems,
  type TagMenuActions,
} from "@/features/tags/components/context-menu";
import {
  buildTagGroupMenuItems,
  type TagGroupMenuActions,
} from "@/features/tags/components/group-context-menu";
import { tagOperations } from "@/features/tags/operations/tag-client";
import { getAppRouter } from "@/shared/lib/app-router";
import { eventFromEditable } from "@/shared/lib/editable-target";
import { matchesShortcut } from "@/shared/lib/shortcuts";
import { useTagsTable } from "./context";
import type { TagsRowData } from "./types";

interface TagRowContextValue {
  row: TagsRowData;
  rowRef: RefObject<HTMLDivElement | null>;
  renaming: boolean;
  startRename: () => void;
  saveRename: (name: string) => Promise<void>;
  finishRename: () => void;
  buildMenuItems: () => MenuItemSpec[];
  openTagItems: () => void;
}

const TagRowContext = createContext<TagRowContextValue | null>(null);

export function useTagRow(): TagRowContextValue {
  const ctx = use(TagRowContext);
  if (!ctx) throw new Error("Tag cell must be used within TagRowContext");
  return ctx;
}

export function TagRowProvider({
  row,
  children,
}: {
  row: TagsRowData;
  children: ReactNode;
}) {
  const { groups, tags } = useTagsTable();
  const isGroup = row.kind === "group";
  const name = isGroup ? row.group.name : row.tag.name;

  const [renaming, setRenaming] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  function startRename() {
    setRenaming(true);
  }

  function finishRename() {
    setRenaming(false);
  }

  async function saveRename(next: string) {
    await tagOperations.rename(isGroup ? "group" : "tag", name, next);
  }

  /** A plain listener, since useHotkey copies every registration per render and freezes an index of thousands of tags. */
  useEffect(() => {
    const element = rowRef.current;
    if (!element || renaming) return;
    function onKeyDown(event: KeyboardEvent) {
      if (eventFromEditable(event) || !matchesShortcut(event, "tags.rename"))
        return;
      event.preventDefault();
      setRenaming(true);
    }
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [renaming]);

  function openTagItems() {
    if (isGroup) return;
    selectLibraryNav({ kind: "tag", name });
  }

  function confirmDelete() {
    if (isGroup) {
      void window.pond.query("tagGroups.delete", { name });
      return;
    }
    Dialog.confirm({
      title: "Remove Tag",
      description: `"${name}" will be removed from every save. This cannot be undone.`,
      confirmLabel: "Remove",
      onConfirm: () => void window.pond.query("tags.delete", { name }),
    });
  }

  function buildMenuItems(): MenuItemSpec[] {
    if (isGroup) {
      const actions: TagGroupMenuActions = {
        color: row.group.color,
        tagCount: row.group.tagNames.length,
        onFilter: () => {
          const names = row.group.tagNames;
          if (names.length === 0) return;
          resetFilters();
          setQuery({
            combinator: "and",
            rules: [{ field: "tags", operator: "some", value: names }],
          });
          libraryChrome.setNav({ kind: "all" });
          getAppRouter()?.history.push("/");
        },
        onRename: startRename,
        onChangeColor: (color) =>
          void window.pond.query("tagGroups.update", {
            name,
            patch: { color },
          }),
        mergeTargets: groups.filter(
          (group) => group.toLowerCase() !== name.toLowerCase(),
        ),
        onMerge: (target) =>
          void window.pond.query("tagGroups.merge", { from: name, to: target }),
        onRequestDelete: confirmDelete,
      };
      return buildTagGroupMenuItems(actions);
    }
    const inGroup = row.kind === "tag" ? row.inGroup : null;
    const actions: TagMenuActions = {
      groups,
      mergeTargets: tags.filter(
        (candidate) => candidate.toLowerCase() !== name.toLowerCase(),
      ),
      inGroup,
      starred: row.kind === "tag" && row.tag.starred,
      onFilter: openTagItems,
      onSetStarred: (starred) =>
        void window.pond.query("tags.update", {
          name,
          patch: { starred },
        }),
      onAddToGroup: (g) =>
        void window.pond.query("tagGroups.addTags", { tags: [name], group: g }),
      onMoveToGroup: (g) => {
        if (!inGroup || inGroup === g) return;
        void tagOperations.moveToGroup(name, inGroup, g);
      },
      onRemoveFromGroup: () => {
        if (!inGroup) return;
        void window.pond.query("tagGroups.removeTag", {
          tag: name,
          group: inGroup,
        });
      },
      onMerge: (target) => void tagOperations.mergeTags([name], target),
      onRename: startRename,
      onRemove: confirmDelete,
    };
    return buildTagMenuItems(actions);
  }

  const value: TagRowContextValue = {
    row,
    rowRef,
    renaming,
    startRename,
    saveRename,
    finishRename,
    buildMenuItems,
    openTagItems,
  };

  return <TagRowContext value={value}>{children}</TagRowContext>;
}
