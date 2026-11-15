import { Dialog } from "@pond/ui";
import { useMemo } from "react";
import { canvasIdFromPath, canvasItems, useCanvas } from "@/features/canvas";
import { fishIdFromPath, fishPaneItems, useFish } from "@/features/fish";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import {
  ENTRY_TYPES,
  entryItems,
  quickAccessIdsFor,
} from "@/features/library/components/smart-folders/menu-items";
import { useCommandContexts } from "@/features/library/state/command-context";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  savedViews,
  useSavedViews,
} from "@/features/library/state/saved-views";
import { useActiveViewId } from "@/features/library/state/view-store";
import { isSaveCollectionPath } from "@/features/saves";
import {
  buildTagMenuItems,
  tagOperations,
  useTagGroups,
  useTags,
} from "@/features/tags";
import { usePrefs } from "@/shared/state/prefs";
import { offerEntries } from "./offer-entries";
import { specEntries } from "./spec-entries";
import type { MenuEntry } from "./types";

const TAG_SUGGESTED = new Set(["Rename Tag", "Merge Into", "Remove Tag"]);
const VIEW_SUGGESTED = new Set(["Edit Filters", "Rename", "Duplicate"]);

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function useTagEntries(name: string | null, searching: boolean): MenuEntry[] {
  const tags = useTags();
  const groups = useTagGroups();
  return useMemo(() => {
    const tag = name ? tags.find((row) => same(row.name, name)) : undefined;
    if (!tag) return [];
    const inGroup =
      groups.find((group) => group.tagNames.some((n) => same(n, tag.name)))
        ?.name ?? null;
    const items = buildTagMenuItems({
      groups: groups.map((group) => group.name),
      mergeTargets: tags
        .map((row) => row.name)
        .filter((candidate) => !same(candidate, tag.name)),
      inGroup,
      starred: tag.starred,
      onFilter: () => {},
      onSetStarred: (starred) =>
        void window.pond.query("tags.update", {
          name: tag.name,
          patch: { starred },
        }),
      onAddToGroup: (group) =>
        void window.pond.query("tagGroups.addTags", {
          tags: [tag.name],
          group,
        }),
      onMoveToGroup: (group) => {
        if (!inGroup || inGroup === group) return;
        void tagOperations.moveToGroup(tag.name, inGroup, group);
      },
      onRemoveFromGroup: () => {
        if (!inGroup) return;
        void window.pond.query("tagGroups.removeTag", {
          tag: tag.name,
          group: inGroup,
        });
      },
      onMerge: (target) =>
        void tagOperations
          .mergeTags([tag.name], target)
          .then(() => selectLibraryNav({ kind: "tag", name: target })),
      onRename: () =>
        Dialog.prompt({
          title: "Rename Tag",
          confirmLabel: "Rename",
          initialValue: tag.name,
          emptyError: "Enter a tag name.",
          onConfirm: async (value) => {
            const next = value.trim();
            if (next === tag.name) return;
            await tagOperations.rename("tag", tag.name, next);
            selectLibraryNav({ kind: "tag", name: next });
          },
        }),
      onRemove: () =>
        Dialog.confirm({
          title: "Remove Tag",
          description: `"${tag.name}" will be removed from every save. This cannot be undone.`,
          confirmLabel: "Remove",
          onConfirm: () =>
            void window.pond
              .query("tags.delete", { name: tag.name })
              .then(() => selectLibraryNav({ kind: "all" })),
        }),
    });
    const group = "Current Tag";
    return offerEntries({
      group,
      key: "tag",
      entries: specEntries(items, group, "tag").filter(
        (entry) => entry.label !== "Filter Items with the Tag(s)",
      ),
      suggested: TAG_SUGGESTED,
      searching,
    });
  }, [name, tags, groups, searching]);
}

function useSavedViewEntries(
  enabled: boolean,
  searching: boolean,
): MenuEntry[] {
  const activeViewId = useActiveViewId();
  const views = useSavedViews();
  const [presentations] = usePrefs("savedViewViews");
  return useMemo(() => {
    const view = enabled
      ? views.find((entry) => entry.id === activeViewId)
      : undefined;
    if (!view) return [];
    const items = entryItems({
      view,
      views,
      active: true,
      onSelect: () => savedViews.select(view.id),
      onCreated: () => savedViews.select(view.id),
      onRename: () => savedViews.startEditing(view.id),
      onStartRenaming: (id) => savedViews.startEditing(id),
      openEditor: (request) =>
        request.mode === "edit"
          ? savedViews.editView(request.view.id)
          : savedViews.openEditor({
              kind: request.kind,
              parentId: request.parentId,
            }),
      presentation: presentations[view.id] ?? {},
      quickAccessIds: quickAccessIdsFor(views, presentations),
    });
    const group = `Current ${ENTRY_TYPES[view.kind].label}`;
    return offerEntries({
      group,
      key: "saved-view",
      entries: specEntries(items, group, "saved-view"),
      suggested: VIEW_SUGGESTED,
      searching,
    });
  }, [enabled, activeViewId, views, presentations, searching]);
}

function useCanvasEntries(pathname: string, searching: boolean): MenuEntry[] {
  const canvas = useCanvas(canvasIdFromPath(pathname));
  return useMemo(() => {
    if (!canvas) return [];
    const group = "Current Canvas";
    return offerEntries({
      group,
      key: "canvas",
      entries: specEntries(canvasItems(canvas), group, "canvas").filter(
        (entry) => entry.label !== "Open",
      ),
      searching,
    });
  }, [canvas, searching]);
}

function useFishEntries(pathname: string, searching: boolean): MenuEntry[] {
  const target = useFish(fishIdFromPath(pathname));
  return useMemo(() => {
    if (!target) return [];
    const group = "Current Fish";
    return offerEntries({
      group,
      key: "fish",
      entries: specEntries(fishPaneItems(target), group, "fish"),
      searching,
    });
  }, [target, searching]);
}

function useRegisteredEntries(searching: boolean): MenuEntry[] {
  const contexts = useCommandContexts();
  return useMemo(
    () =>
      contexts.flatMap(({ group, items }, index) =>
        offerEntries({
          group,
          key: `context.${index}`,
          entries: specEntries(items(), group, `context.${index}`),
          searching,
        }),
      ),
    [contexts, searching],
  );
}

/** Actions for the page itself: the tag or Smart Folder you're filtered by, the open Canvas or Fish, and whatever a page registers. */
export function usePageEntries(
  pathname: string,
  searching: boolean,
): MenuEntry[] {
  const nav = useLibraryNav();
  const onCollection = isSaveCollectionPath(pathname);
  const tag = useTagEntries(
    onCollection && nav.kind === "tag" ? nav.name : null,
    searching,
  );
  const view = useSavedViewEntries(onCollection, searching);
  const canvas = useCanvasEntries(pathname, searching);
  const fish = useFishEntries(pathname, searching);
  const registered = useRegisteredEntries(searching);
  return useMemo(
    () => [...tag, ...view, ...canvas, ...fish, ...registered],
    [tag, view, canvas, fish, registered],
  );
}
