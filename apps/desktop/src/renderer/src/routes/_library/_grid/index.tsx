import { IconAlbum2 } from "@pond/icons";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isLayoutValue } from "@/features/library/lib/view-prefs";
import { legacyIndexSearchSchema } from "@/features/search/lib/schemas";
import { pathForLibraryNav, savedViewPath } from "@/shared/lib/library-nav";

export const Route = createFileRoute("/_library/_grid/")({
  staticData: {
    nav: () => ({ kind: "all" }),
    crumb: { label: "All", icon: IconAlbum2 },
  },
  validateSearch: legacyIndexSearchSchema,
  beforeLoad: ({ search }) => {
    if (search.folder)
      throw redirect({
        href: pathForLibraryNav({ kind: "folder", id: search.folder }),
        replace: true,
      });
    if (search.inbox !== undefined)
      throw redirect({ href: "/inbox", replace: true });
    if (search.view && !isLayoutValue(search.view))
      throw redirect({ href: savedViewPath(search.view), replace: true });
  },
});
