import { IconFolder } from "@pond/icons";
import { useMemo, useState } from "react";
import { PickerPanel, usePickerCursor } from ".";
import type { ComponentDocs } from "../shared/docs";

interface Folder {
  id: string;
  name: string;
}

const FOLDERS: ReadonlyArray<Folder> = [
  { id: "inbox", name: "Inbox" },
  { id: "design", name: "Design" },
  { id: "recipes", name: "Recipes" },
  { id: "reading", name: "Reading List" },
  { id: "travel", name: "Travel" },
];

const folderId = (folder: Folder) => folder.id;

function FolderList() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlyArray<string>>(["design"]);
  const folders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? FOLDERS.filter((folder) => folder.name.toLowerCase().includes(needle))
      : FOLDERS;
  }, [query]);
  const cursor = usePickerCursor({
    items: folders,
    getId: folderId,
    onActivate: (folder) =>
      setSelected((current) =>
        current.includes(folder.id)
          ? current.filter((id) => id !== folder.id)
          : [...current, folder.id],
      ),
  });

  return (
    <PickerPanel.Surface>
      <PickerPanel.Header>
        <PickerPanel.Search
          {...cursor.inputProps}
          aria-label="Search Folders"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </PickerPanel.Header>
      <PickerPanel.Collection
        id={cursor.collectionId}
        aria-label="Folders"
        aria-multiselectable
      >
        {folders.map((folder) => {
          const state = selected.includes(folder.id) ? "checked" : "unchecked";
          return (
            <PickerPanel.Item
              key={folder.id}
              {...cursor.getItemProps(folder)}
              selected={state}
            >
              <PickerPanel.ItemIcon>
                <IconFolder size={14} />
              </PickerPanel.ItemIcon>
              <PickerPanel.ItemLabel>{folder.name}</PickerPanel.ItemLabel>
              <PickerPanel.SelectionMark state={state} />
            </PickerPanel.Item>
          );
        })}
        {folders.length === 0 ? (
          <PickerPanel.Empty>No matching folders.</PickerPanel.Empty>
        ) : null}
      </PickerPanel.Collection>
    </PickerPanel.Surface>
  );
}

export const docs: ComponentDocs = {
  slug: "picker-panel",
  name: "Picker Panel",
  tier: "overlay",
  summary:
    "A popover with a search field over a list of options, where the arrow keys move a highlight while you keep typing.",
  parts: [
    {
      name: "Root",
      description:
        "Popover state. Pass `open` and `onOpenChange` to control it.",
    },
    {
      name: "Trigger",
      description:
        "Opens the panel. Renders a secondary `Button` unless you pass `render`.",
    },
    {
      name: "Popup",
      description: "The panel chrome, inside `Portal` and `Positioner`.",
    },
    { name: "Surface", description: "Lays out the header, list and footer." },
    {
      name: "Search",
      description:
        "The text field that keeps focus. Requires `aria-label` or `aria-labelledby`.",
    },
    {
      name: "Collection",
      description:
        'The list. Defaults to `role="listbox"`; pass `role="tree"` for nested rows.',
    },
    {
      name: "Group",
      description:
        "Groups rows under a `GroupLabel` or a collapsible `SectionButton`.",
    },
    {
      name: "Item",
      description:
        "One option. `selected` sets `aria-selected` and the check; `active` marks the highlight.",
    },
    { name: "ItemIcon", description: "A leading icon." },
    {
      name: "ItemLabel",
      description: "The truncating name. `path` shows parent names before it.",
    },
    { name: "ItemMeta", description: "Trailing detail, like a count." },
    {
      name: "SelectionMark",
      description: "A check or dash for `checked` and `mixed` rows.",
    },
    { name: "Empty", description: "A message when nothing matches." },
    { name: "Footer", description: "Actions or a `Hint` below the list." },
    {
      name: "usePickerCursor",
      description:
        "Wires `Search` to the items: highlight, `aria-activedescendant` and Enter.",
    },
  ],
  keyboard: [
    {
      keys: "ArrowDown",
      action: "Moves the highlight to the next row, wrapping at the end",
    },
    {
      keys: "ArrowUp",
      action: "Moves the highlight to the previous row, wrapping at the start",
    },
    { keys: "PageDown", action: "Moves the highlight a page down" },
    { keys: "PageUp", action: "Moves the highlight a page up" },
    {
      keys: "ArrowLeft / ArrowRight",
      action:
        "Moves across a grid, or collapses and expands a tree row with `onHorizontalKey`",
    },
    { keys: "Enter", action: "Activates the highlighted row" },
    { keys: "Home / End", action: "Moves the caret in the search field" },
    { keys: "Escape", action: "Closes the panel" },
  ],
  accessibility: [
    "Focus stays in the search field, which is a `combobox` pointing `aria-activedescendant` at the highlighted row.",
    "The highlight comes from UI SDK `createListbox` with virtual focus, so screen readers follow it without moving focus.",
    "Rows are `option`s in a `listbox` and report `aria-selected`. The highlight is `data-highlighted`, never `aria-selected`.",
    "Enter is ignored while an input method is composing text.",
  ],
  examples: [
    {
      name: "Folder List",
      render: () => <FolderList />,
    },
    {
      name: "In a Popover",
      render: () => (
        <PickerPanel.Root>
          <PickerPanel.Trigger>Move to Folder</PickerPanel.Trigger>
          <PickerPanel.Portal>
            <PickerPanel.Positioner>
              <PickerPanel.Popup>
                <FolderList />
              </PickerPanel.Popup>
            </PickerPanel.Positioner>
          </PickerPanel.Portal>
        </PickerPanel.Root>
      ),
    },
  ],
};
