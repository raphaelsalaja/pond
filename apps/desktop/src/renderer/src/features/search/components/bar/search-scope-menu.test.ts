import { DEFAULT_PREFS } from "@pond/schema";
import { describe, expect, it, vi } from "vitest";
import {
  buildSearchScopeItems,
  keywordScopesFromPrefs,
} from "./search-scope-menu";

describe("search scope menu", () => {
  it("checks every default scope and persists changes", () => {
    const onChange = vi.fn();
    const scopes = DEFAULT_PREFS.search.scopes;
    const items = buildSearchScopeItems({ scopes, onChange });
    expect(items.filter((item) => item.type === "checkbox")).toHaveLength(11);
    expect(keywordScopesFromPrefs(scopes)).toBeUndefined();
    const title = items.find(
      (item) => "label" in item && item.label === "Name",
    );
    if (title?.type !== "checkbox") throw new Error("Missing name scope");
    title.onCheckedChange?.(false);
    expect(onChange).toHaveBeenCalledWith({ ...scopes, title: false });
  });

  it("does not allow disabling the last scope", () => {
    const scopes = {
      ...DEFAULT_PREFS.search.scopes,
      description: false,
      creator: false,
      tags: false,
      notes: false,
      url: false,
      folder: false,
      folderDescription: false,
      extension: false,
      annotation: false,
    };
    const title = buildSearchScopeItems({ scopes, onChange: vi.fn() }).find(
      (item) => "label" in item && item.label === "Name",
    );
    expect(title).toMatchObject({ checked: true, disabled: true });
    expect(keywordScopesFromPrefs(scopes)).toEqual(["title"]);
  });
});
