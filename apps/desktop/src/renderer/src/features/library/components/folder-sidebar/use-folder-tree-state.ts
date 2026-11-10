import type { Folder } from "@pond/schema/db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { type FolderListSort, flattenFolderTree, sortFolderRows } from "./tree";
import type { FolderDropState } from "./use-folder-drag-drop";

const COLLAPSED_FOLDERS_KEY = "pond:collapsed-folders";
const FOLDER_LIST_SORT_KEY = "pond:folder-list-sort";
const FolderListSortSchema = z
  .enum(["manual", "createdAt", "title"])
  .catch("manual");

function loadCollapsedFolders(): Set<string> {
  try {
    return new Set(
      z
        .array(z.string())
        .parse(JSON.parse(localStorage.getItem(COLLAPSED_FOLDERS_KEY) ?? "[]")),
    );
  } catch {
    return new Set();
  }
}

function persistCollapsedFolders(next: Set<string>): Set<string> {
  try {
    localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]));
  } catch {}
  return next;
}

function loadFolderListSort(): FolderListSort {
  return FolderListSortSchema.parse(localStorage.getItem(FOLDER_LIST_SORT_KEY));
}

function persistFolderListSort(next: FolderListSort): FolderListSort {
  try {
    localStorage.setItem(FOLDER_LIST_SORT_KEY, next);
  } catch {}
  return next;
}

export function useFolderTreeState(folderRows: Folder[]) {
  const [collapsed, setCollapsed] = useState(loadCollapsedFolders);
  const [sort, setSortState] = useState(loadFolderListSort);
  const folderRowsRef = useRef(folderRows);
  folderRowsRef.current = folderRows;
  const sortedRows = useMemo(
    () => sortFolderRows(folderRows, sort),
    [folderRows, sort],
  );
  const nested = useMemo(
    () => flattenFolderTree(sortedRows, collapsed),
    [sortedRows, collapsed],
  );
  const parentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of folderRows) {
      if (row.parentId) ids.add(row.parentId);
    }
    return ids;
  }, [folderRows]);

  const revealFolder = useCallback((id: string) => {
    setCollapsed((previous) => {
      const parents = new Map(
        folderRowsRef.current.map((row) => [row.id, row.parentId]),
      );
      const next = new Set(previous);
      let current: string | null = id;
      let changed = false;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        if (next.delete(current)) changed = true;
        current = parents.get(current) ?? null;
      }
      return changed ? persistCollapsedFolders(next) : previous;
    });
  }, []);

  function toggleFolder(id: string): void {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return persistCollapsedFolders(next);
    });
  }

  function toggleSameLevel(parentId: string | null, expanded: boolean): void {
    setCollapsed((previous) => {
      const next = new Set(previous);
      for (const row of folderRows) {
        if (row.parentId !== parentId || !parentIds.has(row.id)) continue;
        if (expanded) next.add(row.id);
        else next.delete(row.id);
      }
      return persistCollapsedFolders(next);
    });
  }

  function toggleAllFolders(): void {
    setCollapsed((previous) => {
      const next = new Set(previous);
      const expand = [...parentIds].some((id) => previous.has(id));
      for (const id of parentIds) {
        if (expand) next.delete(id);
        else next.add(id);
      }
      return persistCollapsedFolders(next);
    });
  }

  function setSort(next: FolderListSort): void {
    setSortState(persistFolderListSort(next));
  }

  return {
    collapsed,
    nested,
    parentIds,
    revealFolder,
    setSort,
    sort,
    toggleAllFolders,
    toggleFolder,
    toggleSameLevel,
  };
}

export function useRevealFolderDrop(
  folderDrop: FolderDropState | null,
  revealFolder: (id: string) => void,
): void {
  useEffect(() => {
    if (folderDrop?.kind !== "into") return;
    const timer = window.setTimeout(() => revealFolder(folderDrop.id), 600);
    return () => window.clearTimeout(timer);
  }, [folderDrop, revealFolder]);
}
