import {
  FilterBar,
  FilterToggle,
} from "@/features/library/components/filter-menu";
import { ViewMenu } from "@/features/library/components/view-menu";
import { SearchComposer } from "@/features/search";
import { SearchChrome } from "@/shared/components/search-chrome";

interface LibraryChromeProps {
  className?: string;
}

export function LibraryChrome({ className }: LibraryChromeProps) {
  return (
    <SearchChrome.Root
      className={className}
      actions={
        <>
          <FilterToggle />
          <ViewMenu />
        </>
      }
      below={<FilterBar />}
    >
      <SearchComposer />
    </SearchChrome.Root>
  );
}
