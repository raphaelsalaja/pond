import type { TagGroup } from "@pond/schema/db";
import type { EmptyInput, OkResult } from "./query-contracts-shared";

export interface TagGroupQueryInputs {
  "tagGroups.list": EmptyInput;
  "tagGroups.create": { name: string; color?: string | null };
  "tagGroups.rename": { from: string; to: string };
  "tagGroups.update": {
    name: string;
    patch: {
      name?: string;
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
      collapsed?: boolean;
    };
  };
  "tagGroups.delete": { name: string };
  "tagGroups.merge": { from: string; to: string };
  "tagGroups.addTags": { tags: Array<string>; group: string };
  "tagGroups.removeTag": { tag: string; group: string };
}

export interface TagGroupQueryResults {
  "tagGroups.list": Array<
    TagGroup & { tagIds: Array<string>; tagNames: Array<string> }
  >;
  "tagGroups.create": OkResult;
  "tagGroups.rename": OkResult;
  "tagGroups.update": OkResult;
  "tagGroups.delete": OkResult<{ affected: number }>;
  "tagGroups.merge": OkResult<{ affected: number }>;
  "tagGroups.addTags": OkResult<{ affected: number }>;
  "tagGroups.removeTag": OkResult;
}
