import type { Query } from "@pond/schema/filters/types";
import { folders } from "@/features/library/state/folders";
import { descendantFolderIds } from "@/features/saves";
import { getAppRouter } from "@/shared/lib/app-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";

function go(path: string, filters?: Query): void {
  const router = getAppRouter();
  if (!router) return;
  router.history.push(
    `${path}${router.options.stringifySearch(filters ? { filters } : {})}`,
  );
}

export function enterAll(filters?: Query): void {
  go("/", filters);
}

export function enterFolder(folderId: string): void {
  go(pathForLibraryNav({ kind: "folder", id: folderId }));
}

export function enterFolders(ids: string[], includeSubfolders: boolean): void {
  if (ids.length === 0) {
    enterAll();
    return;
  }
  if (ids.length === 1 && ids[0]) {
    enterFolder(ids[0]);
    return;
  }
  enterAll({
    combinator: "and",
    rules: [
      {
        field: "folder",
        operator: "some",
        value: [
          ...new Set(
            ids.flatMap((id) =>
              includeSubfolders
                ? [...descendantFolderIds(id, folders.snapshot())]
                : [id],
            ),
          ),
        ],
      },
    ],
  });
}
