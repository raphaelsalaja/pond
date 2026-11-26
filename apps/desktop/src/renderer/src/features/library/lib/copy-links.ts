import { libraryFolderLink, librarySavedViewLink } from "@shared/library-links";
import { notify } from "@/shared/lib/toast";

function copyLink(text: string, id: string, title: string): void {
  void window.pond
    .query("clipboard.writeText", { text })
    .then(() => notify({ id, title }));
}

/** Copies a `pond://folder/…` link that opens the folder in this Library. */
export function copyFolderLink(folderId: string): void {
  copyLink(
    libraryFolderLink(window.pond.libraryId(), folderId),
    "folder-link",
    "Folder link copied",
  );
}

/** Copies a `pond://view/…` link to a Smart Folder, Group, or Saved View. */
export function copySavedViewLink(viewId: string): void {
  copyLink(
    librarySavedViewLink(window.pond.libraryId(), viewId),
    "saved-view-link",
    "Link copied",
  );
}
