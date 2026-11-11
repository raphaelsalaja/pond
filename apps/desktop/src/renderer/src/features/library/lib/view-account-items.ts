import { libraryChrome } from "@/features/library/state/library-chrome";
import {
  resetFilters,
  setSearchInput,
} from "@/features/library/state/view-store";
import { getAppRouter } from "@/shared/lib/app-router";

function showAllCollection(): void {
  // Sources keeps the previous library destination. Show All has to select
  // All itself, or the account filter stays inside that folder or collection.
  libraryChrome.setNav({ kind: "all" });
  const router = getAppRouter();
  if (router && router.state.location.pathname !== "/") {
    router.history.push("/");
  }
}

export function viewAccountItems(accountId: string | readonly string[]): void {
  const ids = Array.isArray(accountId) ? [...accountId] : [accountId];
  const id = ids[0];
  if (!id) return;
  resetFilters();
  setSearchInput(
    ids.length === 1
      ? [{ field: "account", operator: "eq", value: id }]
      : [{ field: "account", operator: "in", value: ids }],
    "",
  );
  showAllCollection();
}
