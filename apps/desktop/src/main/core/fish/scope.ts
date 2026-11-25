import type { Query } from "@pond/schema/filters";
import type { FishScope } from "../../../shared/fish-contracts";

/** A fish sees Saves in any of its folders or with any of its tags; an empty scope is the whole Library. */
export function fishScopeFilter(scope: FishScope): Query | undefined {
  const rules: Query["rules"] = [];
  if (scope.folderIds.length) {
    rules.push({ field: "folder", operator: "some", value: scope.folderIds });
  }
  if (scope.tags.length) {
    rules.push({ field: "tags", operator: "some", value: scope.tags });
  }
  return rules.length ? { combinator: "or", rules } : undefined;
}
