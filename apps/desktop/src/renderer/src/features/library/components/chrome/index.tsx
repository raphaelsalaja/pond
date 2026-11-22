import { Input } from "@pond/ui";
import { FilterToggle } from "@/features/library/components/filter-menu";
import { ViewMenu } from "@/features/library/components/view-menu";
import { ViewScopeMenu } from "@/features/library/components/view-scope-menu";
import { useSearchView } from "@/features/library/hooks/use-search-view";
import {
  canSearchAllSaves,
  searchViewName,
} from "@/features/library/lib/search-view";
import { useFolders } from "@/features/library/state/folders";
import { useSearchScope } from "@/features/library/state/view-store";
import { SearchComposer } from "@/features/search";
import { SearchChrome } from "@/shared/components/search-chrome";

interface LibrarySearchProps {
  className?: string;
}

export function LibrarySearch({ className }: LibrarySearchProps) {
  return (
    <SearchChrome.Shell className={className}>
      <Input.Editor>
        <SearchComposer />
      </Input.Editor>
    </SearchChrome.Shell>
  );
}

export function LibrarySearchActions() {
  const view = useSearchView();
  const scope = useSearchScope(view);
  const folders = useFolders();
  const name = searchViewName(view, folders);
  return (
    <SearchChrome.Actions>
      {canSearchAllSaves(view) ? (
        <ViewScopeMenu view={view} name={name} scope={scope} />
      ) : null}
      <FilterToggle />
      <ViewMenu />
    </SearchChrome.Actions>
  );
}
