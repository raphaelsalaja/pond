import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuleDialog, type RuleDialogProps } from "./rule-dialog";
import {
  compileRuleQuery,
  editableQuery,
  newRule,
  ruleQueryReady,
} from "./rule-editor";

const nameQuery = (name: string): Query => ({
  combinator: "or",
  rules: [{ field: "title", operator: "contains", value: name }],
});

describe("smart folder rule dialog", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  async function render(patch: Partial<RuleDialogProps> = {}) {
    await act(async () =>
      root.render(
        <RuleDialog
          kind="smart_folder"
          query={nameQuery("")}
          inheritedQuery={EMPTY_QUERY}
          choices={{ folders: [], tags: [] }}
          count={async () => 0}
          onSave={async () => {}}
          onClose={() => {}}
          {...patch}
        />,
      ),
    );
  }
  function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll("button")].find(
      (node) =>
        node.textContent === label || node.getAttribute("aria-label") === label,
    );
    if (!found) throw new Error(`Missing button ${label}`);
    return found;
  }
  async function fill(label: string, value: string) {
    const field = [...document.querySelectorAll("input")].find(
      (node) =>
        node.getAttribute("aria-label") === label ||
        document.querySelector(`label[for="${node.id}"]`)?.textContent ===
          label,
    );
    if (!field) throw new Error(`Missing input ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function settle() {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  }

  it("keeps incomplete drafts out of preview and persists only local rules", async () => {
    const previews: Query[] = [];
    const saved: { name: string; query: Query }[] = [];
    let closed = false;
    await render({
      inheritedQuery: {
        combinator: "and",
        rules: [{ field: "tags", operator: "some", value: ["reference"] }],
      },
      parentName: "References",
      count: async (query) => {
        previews.push(query);
        return 12;
      },
      onSave: async (name, query) => {
        saved.push({ name, query });
      },
      onClose: () => {
        closed = true;
      },
    });
    await fill("Smart Folder Name", "  Forests  ");
    await act(async () => button("Create").click());
    expect(saved).toHaveLength(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Complete every rule to save.",
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Name Value",
    );
    await settle();
    expect(previews).toHaveLength(0);
    await fill("Name Value", "forest");
    await settle();
    expect(document.body.textContent).toContain("Found 12 saves");
    expect(JSON.stringify(previews[0])).toContain("reference");
    await act(async () => button("Create").click());
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Forests");
    expect(JSON.stringify(saved[0]?.query)).toContain("forest");
    expect(JSON.stringify(saved[0]?.query)).not.toContain("reference");
    expect(closed).toBe(true);
  });

  it("explains a missing name beside the field and focuses it", async () => {
    const saved: string[] = [];
    await render({
      query: nameQuery("forest"),
      onSave: async (name) => {
        saved.push(name);
      },
    });
    await act(async () => button("Create").click());
    expect(saved).toHaveLength(0);
    expect(document.body.textContent).toContain("Name the smart folder.");
    const field = document.activeElement;
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.querySelector(`label[for="${field?.id}"]`)?.textContent,
    ).toBe("Smart Folder Name");
  });

  it("refreshes an unchanged rule count after a library revision", async () => {
    let matches = 3;
    const count = async () => matches;
    const props = { name: "Landscape", query: nameQuery("forest"), count };
    await render({ ...props, libraryRevision: 1 });
    await settle();
    expect(document.body.textContent).toContain("Found 3 saves");
    matches = 4;
    await render({ ...props, libraryRevision: 2 });
    await settle();
    expect(document.body.textContent).toContain("Found 4 saves");
  });

  it("ignores a late result for a previous rule draft", async () => {
    const complete: ((count: number) => void)[] = [];
    await render({
      name: "Landscape",
      query: nameQuery("forest"),
      count: () => new Promise((resolve) => complete.push(resolve)),
    });
    await settle();
    await fill("Name Value", "lake");
    await settle();
    await act(async () => complete[0]?.(99));
    expect(document.body.textContent).not.toContain("Found 99");
    await act(async () => complete[1]?.(7));
    expect(document.body.textContent).toContain("Found 7 saves");
  });

  it("adds nested rule groups, retains edits on save failure, and closes without saving", async () => {
    let attempts = 0;
    let closed = false;
    await render({
      name: "Animals",
      query: nameQuery("fox"),
      onSave: async () => {
        attempts += 1;
        throw new Error("Disk unavailable");
      },
      onClose: () => {
        closed = true;
      },
    });
    await act(async () => button("Add Rule Group").click());
    expect(
      document.querySelector('[aria-label="Rules Group 2 Match"]'),
    ).not.toBeNull();
    await act(async () => button("Create").click());
    expect(attempts).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Complete every rule to save.",
    );
    await act(async () => button("Remove Rules Group 2").click());
    await act(async () => button("Create").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Couldn't save these rules. Try again.",
    );
    expect(closed).toBe(false);
    await act(async () => button("Cancel").click());
    expect(attempts).toBe(1);
    expect(closed).toBe(true);
  });

  it("lists folders and tags with their parent or group, in the same order as the other pickers", async () => {
    const saved: Query[] = [];
    await render({
      name: "Food",
      query: {
        combinator: "and",
        rules: [
          { field: "folder", operator: "some", value: [] },
          { field: "tags", operator: "some", value: ["Design"] },
        ],
      },
      choices: {
        folders: [
          { value: "yt-food", label: "Food", crumb: "YouTube" },
          { value: "youtube", label: "YouTube" },
          { value: "ig-food", label: "Food", crumb: "Instagram" },
          { value: "instagram", label: "Instagram" },
        ],
        tags: [
          { value: "Motion", label: "Motion", crumb: "Craft" },
          { value: "Design", label: "Design" },
        ],
      },
      onSave: async (_name, query) => {
        saved.push(query);
      },
    });
    await act(async () => button("Folders Values").click());
    expect(choiceRows()).toEqual([
      { crumb: null, label: "Instagram" },
      { crumb: "Instagram", label: "Food" },
      { crumb: null, label: "YouTube" },
      { crumb: "YouTube", label: "Food" },
    ]);
    const nested = [...document.querySelectorAll('[role="option"]')].find(
      (node) =>
        node.querySelector("[data-menu-breadcrumb]")?.textContent ===
        "Instagram",
    );
    if (!(nested instanceof HTMLElement))
      throw new Error("Missing Instagram Food option");
    await act(async () => nested.click());
    await act(async () => button("Folders Values").click());
    await act(async () => button("Tags Values").click());
    expect(choiceRows()).toEqual([
      { crumb: "Craft", label: "Motion" },
      { crumb: null, label: "Design" },
    ]);
    await act(async () => button("Create").click());
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved[0])).toContain("ig-food");
    expect(JSON.stringify(saved[0])).not.toContain("Instagram");
  });
});

function choiceRows(): { crumb: string | null; label: string | null }[] {
  const popup = [...document.querySelectorAll("[data-open]")]
    .filter((node) => node.querySelector('[role="option"]'))
    .at(-1);
  return [...(popup?.querySelectorAll('[role="option"]') ?? [])].map((node) => {
    const crumb = node.querySelector("[data-menu-breadcrumb]");
    const current = node.querySelector("[data-menu-breadcrumb-current]");
    return {
      crumb: crumb?.textContent ?? null,
      label: current?.textContent ?? node.textContent,
    };
  });
}

describe("rule draft persistence", () => {
  it("preserves nested any/all, group and predicate negation, and numeric semantics", () => {
    const draft: Query = {
      combinator: "and",
      rules: [
        {
          combinator: "or",
          not: true,
          rules: [
            { field: "rating", operator: "eq", value: "4" },
            {
              field: "title",
              operator: "contains",
              value: "draft",
              negate: true,
            },
          ],
        },
      ],
    };
    expect(ruleQueryReady(draft)).toBe(true);
    const query = compileRuleQuery(editableQuery(draft));
    expect(query.rules[0]).toMatchObject({
      combinator: "or",
      not: true,
      rules: [{ field: "rating", value: 4 }, { negate: true }],
    });
    expect(draft.rules[0]).toMatchObject({
      rules: [{ value: "4" }, { negate: true }],
    });
  });
  it("rejects incomplete, reversed, invalid numeric and empty negated rules", () => {
    expect(ruleQueryReady({ combinator: "or", rules: [newRule()] })).toBe(
      false,
    );
    expect(ruleQueryReady({ combinator: "and", not: true, rules: [] })).toBe(
      false,
    );
    for (const value of [
      [10, 2],
      ["", 2],
      ["bad", 3],
    ])
      expect(
        ruleQueryReady({
          combinator: "and",
          rules: [{ field: "width", operator: "between", value }],
        }),
      ).toBe(false);
    expect(
      ruleQueryReady({
        combinator: "and",
        rules: [{ field: "rating", operator: "eq", value: 6 }],
      }),
    ).toBe(false);
    expect(
      ruleQueryReady({
        combinator: "and",
        rules: [{ field: "aspect", operator: "eq", value: "21:9" }],
      }),
    ).toBe(true);
  });
});
