import { PickerPanel } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TagMenu, TagMenuView } from "./";

it("keeps an inline tag draft after a failed create and applies it only after retry succeeds", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  let fail = true;
  const created: string[] = [];
  vi.stubGlobal("pond", {
    onSyncAction: () => () => {},
    query: async (name: string, input: { name?: string }) => {
      if (name === "tags.list") {
        return [
          {
            id: "recent",
            name: "Recent Tag",
            starred: false,
            description: null,
            lastUsedAt: 10,
            usageCount: 0,
            createdAt: null,
          },
          {
            id: "other",
            name: "Other Tag",
            starred: false,
            description: null,
            lastUsedAt: null,
            usageCount: 0,
            createdAt: null,
          },
        ];
      }
      if (name === "tagGroups.list") {
        return [
          {
            id: "work",
            name: "Work",
            description: null,
            color: null,
            sortOrder: 0,
            collapsed: false,
            tagIds: ["recent"],
            tagNames: ["Recent Tag"],
          },
        ];
      }
      if (name === "tags.create") {
        if (fail) throw new Error("Library unavailable");
        created.push(input.name ?? "");
        return { id: "new", name: input.name };
      }
      throw new Error(`Unexpected query ${name}`);
    },
  });
  const applied: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PickerPanel.Root open>
          <PickerPanel.Portal>
            <PickerPanel.Positioner>
              <PickerPanel.Popup>
                <TagMenu
                  layout="grid"
                  allowCreate
                  onToggle={(name) => {
                    applied.push(name);
                  }}
                />
              </PickerPanel.Popup>
            </PickerPanel.Positioner>
          </PickerPanel.Portal>
        </PickerPanel.Root>,
      ),
    );
    const others = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Others (1)"),
    );
    if (!others) throw new Error("Missing collapsible section");
    expect(document.body.textContent).toContain("Other Tag");
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    expect(document.querySelector('[data-layout="grid"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Use grid layout"]')).toBeNull();
    expect(document.querySelector("kbd")).toBeNull();
    await act(async () => others.click());
    expect(document.body.textContent).not.toContain("Other Tag");
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => others.click());
    expect(document.body.textContent).toContain("Other Tag");

    const input = document.querySelector("input");
    if (!input) throw new Error("Missing tag search");
    const initialActive = input.getAttribute("aria-activedescendant");
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(input.getAttribute("aria-activedescendant")).not.toBe(initialActive);
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "New Tag");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't create the tag. Try again.",
    );
    expect(input.value).toBe("New Tag");
    expect(applied).toEqual([]);
    fail = false;
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(created).toEqual(["New Tag"]);
    expect(applied).toEqual(["New Tag"]);
    expect(input.value).toBe("");
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("lists tag groups as expandable parents with their tags nested under them", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const tag = (id: string, name: string) => ({
    id,
    name,
    starred: false,
    description: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: null,
  });
  const tags = [tag("sunset", "Sunset"), tag("loose", "Loose")];
  const groups = [
    {
      id: "mood",
      name: "Mood",
      description: null,
      color: null,
      sortOrder: 0,
      collapsed: false,
      tagIds: ["sunset"],
      tagNames: ["Sunset"],
    },
  ];
  const applied: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PickerPanel.Root open>
          <PickerPanel.Portal>
            <PickerPanel.Positioner>
              <PickerPanel.Popup>
                <TagMenuView
                  tags={tags}
                  groups={groups}
                  appliedKeys={new Set(["sunset"])}
                  onToggle={(name) => {
                    applied.push(name);
                  }}
                />
              </PickerPanel.Popup>
            </PickerPanel.Positioner>
          </PickerPanel.Portal>
        </PickerPanel.Root>,
      ),
    );
    const items = () =>
      Array.from(document.querySelectorAll('[role="treeitem"]')).map(
        (item) =>
          `${item.getAttribute("aria-level")}:${item.getAttribute("aria-label")}`,
      );
    expect(document.querySelector('[role="tree"]')).not.toBeNull();
    expect(items()).toEqual(["1:Mood", "2:Sunset", "1:Loose"]);
    expect(
      document
        .querySelector('[aria-label="Sunset"]')
        ?.getAttribute("data-selection"),
    ).toBe("checked");

    const group = document.querySelector<HTMLElement>('[aria-label="Mood"]');
    await act(async () => group?.click());
    expect(items()).toEqual(["1:Mood", "1:Loose"]);
    expect(applied).toEqual([]);

    const loose = document.querySelector<HTMLElement>('[aria-label="Loose"]');
    await act(async () => loose?.click());
    expect(applied).toEqual(["Loose"]);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("puts Create after matching tags and keeps Enter on the first match", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const created: string[] = [];
  vi.stubGlobal("pond", {
    onSyncAction: () => () => {},
    query: async (name: string, input: { name?: string }) => {
      if (name === "tags.create") {
        created.push(input.name ?? "");
        return { id: "new", name: input.name };
      }
      throw new Error(`Unexpected query ${name}`);
    },
  });
  const tag = (id: string, name: string) => ({
    id,
    name,
    starred: false,
    description: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: null,
  });
  const applied: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PickerPanel.Root open>
          <PickerPanel.Portal>
            <PickerPanel.Positioner>
              <PickerPanel.Popup>
                <TagMenuView
                  tags={[tag("desk", "Desk"), tag("design", "Design")]}
                  groups={[]}
                  allowCreate
                  onToggle={(name) => {
                    applied.push(name);
                  }}
                />
              </PickerPanel.Popup>
            </PickerPanel.Positioner>
          </PickerPanel.Portal>
        </PickerPanel.Root>,
      ),
    );
    const input = document.querySelector("input");
    if (!input) throw new Error("Missing tag search");
    const setQuery = (value: string) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const options = () =>
      [...document.querySelectorAll('[role="listbox"] [role="option"]')].map(
        (option) =>
          option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "",
      );
    const active = () => {
      const id = input.getAttribute("aria-activedescendant");
      return id ? document.getElementById(id) : null;
    };

    await act(async () => setQuery("de"));
    expect(options()).toEqual(["Design", "Desk", "Create “de”"]);
    expect(active()?.getAttribute("aria-label")).toBe("Design");
    expect(active()?.hasAttribute("data-create")).toBe(false);
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(applied).toEqual(["Design"]);
    expect(created).toEqual([]);

    await act(async () => setQuery("Quartz"));
    expect(options()).toEqual(["Create “Quartz”"]);
    expect(active()?.hasAttribute("data-create")).toBe(true);
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(created).toEqual(["Quartz"]);
    expect(applied).toEqual(["Design", "Quartz"]);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
