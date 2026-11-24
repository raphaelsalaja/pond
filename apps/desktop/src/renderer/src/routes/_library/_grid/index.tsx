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
    if (search.folder) {
      redirect({
        href: pathForLibraryNav({ kind: "folder", id: search.folder }),
        replace: true,
        throw: true,
      });
      return;
    }
    if (search.inbox !== undefined) {
      redirect({ href: "/inbox", replace: true, throw: true });
      return;
    }
    if (search.view && !isLayoutValue(search.view)) {
      redirect({
        href: savedViewPath(search.view),
        replace: true,
        throw: true,
      });
    }
  },
});
