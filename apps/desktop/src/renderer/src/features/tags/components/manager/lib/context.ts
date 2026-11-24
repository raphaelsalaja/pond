import { createContext, use } from "react";

interface TagsTableValue {
  groups: Array<string>;
  tags: Array<string>;
}

export const TagsTableContext = createContext<TagsTableValue | null>(null);

export function useTagsTable(): TagsTableValue {
  const ctx = use(TagsTableContext);
  if (!ctx) {
    throw new Error("Tags cell must be used within TagsTableContext");
  }
  return ctx;
}
