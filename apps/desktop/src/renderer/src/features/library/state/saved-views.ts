import type { SavedView } from "@pond/schema/db";
import { splitPostPredicate } from "@pond/schema/filters/fields";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import type { QueryInput } from "@shared/query-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import {
  combineQueries,
  inheritedQueryFor,
} from "@/features/library/lib/smart-folders";
import { folders } from "@/features/library/state/folders";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import {
  currentSort,
  getViewState,
  setInheritedQuery,
} from "@/features/library/state/view-store";
import { descendantFolderIds } from "@/features/saves";
import { getAppHistory } from "@/shared/lib/app-router";
import { inboxScope, savedViewPath } from "@/shared/lib/library-nav";

export type SavedViewEditorRequest =
  | {
      token: number;
      mode: "create";
      kind: "smart_folder" | "group";
      parentId: string | null;
    }
  | { token: number; mode: "edit"; viewId: string };

interface SavedViewsState {
  views: Array<SavedView>;
  editingId: string | null;
  editorRequest: SavedViewEditorRequest;
  loaded: boolean;
}

const store = new Store<SavedViewsState>({
  views: [],
  editingId: null,
  editorRequest: {
    token: 0,
    mode: "create",
    kind: "smart_folder",
    parentId: null,
  },
  loaded: false,
});

function currentQuery(): Query {
  const { query, inheritedQuery, includeSubfolders } = getViewState();
  const nav = getLibraryNav();
  let scope = EMPTY_QUERY;
  if (nav?.kind === "folder") {
    scope = {
      combinator: "and",
      rules: [
        {
          field: "folder",
          operator: "some",
          value: includeSubfolders
            ? [...descendantFolderIds(nav.id, folders.snapshot())]
            : [nav.id],
        },
      ],
    };
  } else if (nav?.kind === "tag") {
    scope = {
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: [nav.name] }],
    };
  } else if (nav?.kind === "inbox") {
    scope = {
      combinator: "and",
      rules: [{ field: "inbox", operator: "eq", value: inboxScope(nav) }],
    };
  } else if (nav?.kind === "uncategorized") {
    scope = {
      combinator: "and",
      rules: [{ field: "folder", operator: "empty", value: null }],
    };
  } else if (nav?.kind === "post") {
    scope = { combinator: "and", rules: [splitPostPredicate(nav.key)] };
  }
  return combineQueries([inheritedQuery, query, scope]);
}

export const savedViews = {
  snapshot(): Array<SavedView> {
    return store.state.views;
  },
  startEditing(id: string): void {
    store.setState((state) => ({ ...state, editingId: id }));
  },
  finishEditing(id?: string): void {
    store.setState((state) => ({
      ...state,
      editingId:
        id === undefined || state.editingId === id ? null : state.editingId,
    }));
  },
  openEditor(input: {
    kind: "smart_folder" | "group";
    parentId?: string | null;
  }): void {
    store.setState((state) => ({
      ...state,
      editorRequest: {
        token: state.editorRequest.token + 1,
        mode: "create",
        kind: input.kind,
        parentId: input.parentId ?? null,
      },
    }));
  },
  editView(viewId: string): void {
    store.setState((state) => ({
      ...state,
      editorRequest: {
        token: state.editorRequest.token + 1,
        mode: "edit",
        viewId,
      },
    }));
  },
  async refresh(): Promise<void> {
    const views = await window.pond.query("savedViews.list", {});
    store.setState((state) => ({
      ...state,
      views: views ?? [],
      editingId:
        state.editingId &&
        (views ?? []).some((view) => view.id === state.editingId)
          ? state.editingId
          : null,
      loaded: true,
    }));
    const { activeViewId } = getViewState();
    if (!activeViewId) {
      return;
    }
    const active = store.state.views.find((view) => view.id === activeViewId);
    if (!active) {
      getAppHistory()?.replace("/");
    } else {
      setInheritedQuery(inheritedQueryFor(active, store.state.views));
    }
  },
  loaded(): boolean {
    return store.state.loaded;
  },
  select(id: string, options: { replace?: boolean } = {}): void {
    if (!store.state.views.some((entry) => entry.id === id)) {
      throw new Error("This smart folder item no longer exists.");
    }
    const history = getAppHistory();
    if (!history) {
      return;
    }
    if (options.replace) {
      history.replace(savedViewPath(id));
    } else {
      history.push(savedViewPath(id));
    }
  },
  async create(input: {
    kind: SavedView["kind"];
    parentId?: string | null;
    name: string;
    query?: Query;
  }): Promise<SavedView> {
    const { layout } = getViewState();
    const { key: sortKey, dir: sortDir } = currentSort();
    const payload: QueryInput<"savedViews.create"> = {
      ...input,
      query: input.query ?? (input.parentId ? EMPTY_QUERY : currentQuery()),
    };
    if (input.kind === "saved_view") {
      payload.sortKey = sortKey;
      payload.sortDir = sortDir;
      payload.layout = layout;
    }
    const result = await window.pond.query("savedViews.create", payload);
    if (!result.ok || !result.id) {
      throw new Error("Could not create this smart folder item.");
    }
    await savedViews.refresh();
    const view = store.state.views.find((entry) => entry.id === result.id);
    if (!view) {
      throw new Error("The new smart folder item could not be loaded.");
    }
    savedViews.select(view.id);
    return view;
  },
  async updateCurrent(id: string): Promise<void> {
    const state = getViewState();
    const view = store.state.views.find((entry) => entry.id === id);
    if (!view || state.activeViewId !== id) {
      throw new Error("Open this smart folder item before updating it.");
    }
    const patch: QueryInput<"savedViews.update">["patch"] = {
      query: state.query,
    };
    if (view.kind === "saved_view") {
      const sort = currentSort(state);
      patch.sortKey = sort.key;
      patch.sortDir = sort.dir;
      patch.layout = state.layout;
    }
    const result = await window.pond.query("savedViews.update", { id, patch });
    if (!result.ok) {
      throw new Error("Could not update this smart folder item.");
    }
    await savedViews.refresh();
  },
  async duplicate(id: string): Promise<SavedView> {
    const view = store.state.views.find((entry) => entry.id === id);
    if (!view) {
      throw new Error("This smart folder item no longer exists.");
    }
    const result = await window.pond.query("savedViews.create", {
      name: `${view.name} Copy`,
      kind: view.kind,
      parentId: view.parentId,
      question: view.question,
      query: view.query,
      sortKey: view.sortKey,
      sortDir: view.sortDir,
      layout: view.layout,
    });
    if (!result.ok || !result.id) {
      throw new Error("Could not duplicate this smart folder item.");
    }
    await savedViews.refresh();
    const copy = store.state.views.find((entry) => entry.id === result.id);
    if (!copy) {
      throw new Error("The duplicate could not be loaded.");
    }
    return copy;
  },
  async edit(id: string, name: string, query: Query): Promise<void> {
    const active = getViewState().activeViewId === id;
    const result = await window.pond.query("savedViews.update", {
      id,
      patch: { name, query },
    });
    if (!result.ok) {
      throw new Error("Could not save these rules.");
    }
    await savedViews.refresh();
    if (active) {
      savedViews.select(id, { replace: true });
    }
  },
  async rename(id: string, name: string): Promise<void> {
    const result = await window.pond.query("savedViews.rename", { id, name });
    if (!result.ok) {
      throw new Error("Could not rename this smart folder item.");
    }
    await savedViews.refresh();
  },
  async move(id: string, parentId: string | null): Promise<void> {
    const result = await window.pond.query("savedViews.update", {
      id,
      patch: { parentId },
    });
    if (!result.ok) {
      throw new Error("Could not move this smart folder item.");
    }
    await savedViews.refresh();
  },
  async remove(id: string): Promise<void> {
    const result = await window.pond.query("savedViews.delete", { id });
    if (!result.ok) {
      throw new Error("Could not delete this smart folder item.");
    }
    await savedViews.refresh();
  },
  async reorder(ids: Array<string>): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const result = await window.pond.query("savedViews.reorder", { ids });
    if (!result.ok) {
      throw new Error("Could not reorder these smart folders.");
    }
    await savedViews.refresh();
  },
};

export function subscribeSavedViews(listener: () => void): () => void {
  const subscription = store.subscribe(listener);
  return () => subscription.unsubscribe();
}

export function useSavedViews(): Array<SavedView> {
  return useSelector(store, (s) => s.views);
}

export function useEditingSavedViewId(): string | null {
  return useSelector(store, (s) => s.editingId);
}

export function useSavedViewEditorRequest(): SavedViewEditorRequest {
  return useSelector(store, (s) => s.editorRequest);
}

export function useHydrateSavedViews(): void {
  useEffect(() => {
    void savedViews.refresh();
  }, []);
}
