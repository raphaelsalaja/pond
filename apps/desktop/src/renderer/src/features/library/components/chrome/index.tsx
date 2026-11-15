import {
  FilterBar,
  FilterToggle,
} from "@/features/library/components/filter-menu";
import { ViewMenu } from "@/features/library/components/view-menu";
import { ViewScopeMenu } from "@/features/library/components/view-scope-menu";
import { useSearchView } from "@/features/library/hooks/use-search-view";
import {
  canSearchAllSaves,
  type SearchScope,
  type SearchView,
  searchViewName,
} from "@/features/library/lib/search-view";
import { useFolders } from "@/features/library/state/folders";
import { useSearchScope } from "@/features/library/state/view-store";
import { SearchComposer } from "@/features/search";
import { SearchChrome } from "@/shared/components/search-chrome";

interface LibraryChromeProps {
  className?: string;
}

function placeholderFor(
  view: SearchView,
  scope: SearchScope,
  name: string,
): string {
  if (scope === "all") return "Search all Saves…";
  if (view.kind === "library") return "Search your library…";
  return `Search ${name}…`;
}

export function LibraryChrome({ className }: LibraryChromeProps) {
  const view = useSearchView();
  const scope = useSearchScope(view);
  const folders = useFolders();
  const name = searchViewName(view, folders);
  return (
    <SearchChrome.Root
      className={className}
      actions={
        <>
          {canSearchAllSaves(view) ? (
            <ViewScopeMenu view={view} name={name} scope={scope} />
          ) : null}
          <FilterToggle />
          <ViewMenu />
        </>
      }
      below={<FilterBar />}
    >
      <SearchComposer placeholder={placeholderFor(view, scope, name)} />
    </SearchChrome.Root>
  );
}
