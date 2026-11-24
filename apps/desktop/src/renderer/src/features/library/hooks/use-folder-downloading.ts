import log from "electron-log/renderer";
import { useEffect, useMemo, useState } from "react";
import { useFolders } from "@/features/library/state/folders";
import { useIncludeSubfolders } from "@/features/library/state/view-store";
import { descendantFolderIds } from "@/features/saves";

/** Counts the open Folder's saves still downloading, over the same subfolder scope as its contents. */
export function useFolderDownloading(folderId: string | null): number {
  const folders = useFolders();
  const includeSubfolders = useIncludeSubfolders();
  const key = useMemo(() => {
    if (!folderId) {
      return "";
    }
    const ids = includeSubfolders
      ? [...descendantFolderIds(folderId, folders)]
      : [folderId];
    return ids.join("\0");
  }, [folderId, folders, includeSubfolders]);
  const [counted, setCounted] = useState({ key, count: 0 });
  useEffect(() => {
    const ids = key ? key.split("\0") : [];
    if (ids.length === 0) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await window.pond.query("folders.downloading", {
          folderIds: ids,
        });
        if (active) {
          setCounted({ key, count: next.count });
        }
      } catch (cause) {
        log.warn("[pond] folder downloading count failed", cause);
      }
    };
    void refresh();
    const off = window.pond.onSyncAction(() => {
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 500);
    });
    return () => {
      active = false;
      off();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [key]);
  return counted.key === key ? counted.count : 0;
}
