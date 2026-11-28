import { Input } from "@pond/ui";
import { FilterToggle } from "@/features/library/components/filter-menu";
import { ViewMenu } from "@/features/library/components/view-menu";
import { useLibraryNav } from "@/features/library/state/library-chrome";
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
  const nav = useLibraryNav();
  return (
    <SearchChrome.Actions>
      {nav?.kind === "inbox" ? null : (
        <>
          <FilterToggle />
          <ViewMenu />
        </>
      )}
    </SearchChrome.Actions>
  );
}
