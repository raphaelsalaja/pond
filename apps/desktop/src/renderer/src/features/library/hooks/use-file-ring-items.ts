import type { Folder } from "@pond/schema/db";
import type { FileRingItem } from "@pond/schema/file-ring";
import { useMemo } from "react";
import { usePrefs } from "@/shared/state/prefs";
import { autoRingItems } from "../components/file-ring/slots";
import { recentFolderIds } from "../lib/recent-folders";
import { useFolders } from "../state/folders";

interface FileRingItems {
  items: FileRingItem[];
  customized: boolean;
  folders: Folder[];
}

export function useFileRingItems(): FileRingItems {
  const [fileRing] = usePrefs("fileRing");
  const [folderViews] = usePrefs("folderViews");
  const folders = useFolders();
  return useMemo(
    () =>
      fileRing.items
        ? { items: fileRing.items, customized: true, folders }
        : {
            items: autoRingItems(folders, folderViews, recentFolderIds()),
            customized: false,
            folders,
          },
    [fileRing.items, folders, folderViews],
  );
}
