import {
  IconClock,
  IconFolder,
  IconFolderOpen,
  IconInbox,
  IconTrash,
} from "@pond/icons";
import type { TreeItemData } from "@ui-sdk/react/tree";
import { Sidebar } from ".";
import type { ComponentDocs } from "../shared/docs";

const folders: Array<TreeItemData> = [
  { value: "inbox", label: "Inbox" },
  {
    value: "design",
    label: "Design",
    children: [
      { value: "design/typography", label: "Typography" },
      { value: "design/color", label: "Color" },
    ],
  },
  { value: "archive", label: "Archive" },
];

function FolderRows({ items }: { items: Array<TreeItemData> }) {
  return items.map((item) => (
    <Sidebar.TreeItem key={item.value} value={item.value}>
      <Sidebar.TreeRow>
        {(state) => (
          <>
            <Sidebar.TreeIndicator />
            <Sidebar.Icon>
              {state.expanded ? <IconFolderOpen /> : <IconFolder />}
            </Sidebar.Icon>
            <Sidebar.ItemLabel>{item.label}</Sidebar.ItemLabel>
          </>
        )}
      </Sidebar.TreeRow>
      {item.children ? (
        <Sidebar.TreeGroup>
          <FolderRows items={item.children} />
        </Sidebar.TreeGroup>
      ) : null}
    </Sidebar.TreeItem>
  ));
}

export const docs: ComponentDocs = {
  slug: "sidebar",
  name: "Sidebar",
  tier: "navigation",
  summary:
    "Navigation rows and a folder tree for the left column. The tree has one tab stop and arrow keys between its folders.",
  parts: [
    { name: "Root", description: "The column. `width` is default or full." },
    {
      name: "Group",
      description: "A section of rows, with an optional `GroupLabel`.",
    },
    {
      name: "Item",
      description:
        "A destination row. Holds an `Icon`, an `ItemLabel` and an optional `Count`.",
    },
    {
      name: "CollapsibleGroup",
      description:
        "A section that opens and closes from its `CollapsibleGroupLabel`.",
    },
    {
      name: "Tree",
      description:
        "A folder tree. Needs an `aria-label`. Controls `value` and `expanded`, or starts from `defaultValue` and `defaultExpanded`. Pass `items` so the arrow keys reach rows that aren't rendered.",
    },
    {
      name: "TreeItem",
      description:
        "One folder, keyed by a unique `value`. Takes refs, listeners and a `render` element for drag and drop or context menus.",
    },
    {
      name: "TreeRow",
      description:
        "The item's visible row and its accessible name. Children can be a function of the item's state.",
    },
    {
      name: "TreeIndicator",
      description:
        "The disclosure arrow. Render it on every row so leaves line up with branches.",
    },
    {
      name: "TreeGroup",
      description: "A branch's children. Its presence makes the item a branch.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Enters the tree once, then leaves it" },
    { keys: "Down / Up", action: "Moves to the next or previous visible row" },
    {
      keys: "Right",
      action: "Expands a branch, or moves to its first child",
    },
    { keys: "Left", action: "Collapses a branch, or moves to its parent" },
    { keys: "Home / End", action: "Moves to the first or last visible row" },
    { keys: "Enter", action: "Selects the row and runs its action" },
    { keys: "Space", action: "Selects the row" },
    { keys: "Typing", action: "Moves to the next row starting with that text" },
    { keys: "*", action: "Expands every sibling branch" },
    {
      keys: "Option+Right / Option+Left",
      action: "Expands or collapses a branch and everything in it",
    },
  ],
  accessibility: [
    "The tree follows the WAI-ARIA tree view pattern through UI SDK's tree behavior.",
    "Items set `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` on branches, and `aria-selected` when selection is on.",
    "Focus stays on the item. Its row draws the focus ring, so a branch's ring never wraps its children.",
    "Collapsing a branch that holds focus moves focus to that branch.",
  ],
  examples: [
    {
      name: "Items",
      render: () => (
        <Sidebar.Root>
          <Sidebar.Group>
            <Sidebar.Item data-status="active">
              <Sidebar.Icon>
                <IconInbox />
              </Sidebar.Icon>
              <Sidebar.ItemLabel>Library</Sidebar.ItemLabel>
              <Sidebar.Count>128</Sidebar.Count>
            </Sidebar.Item>
            <Sidebar.Item>
              <Sidebar.Icon>
                <IconClock />
              </Sidebar.Icon>
              <Sidebar.ItemLabel>Recently Used</Sidebar.ItemLabel>
            </Sidebar.Item>
            <Sidebar.Item>
              <Sidebar.Icon>
                <IconTrash />
              </Sidebar.Icon>
              <Sidebar.ItemLabel>Trash</Sidebar.ItemLabel>
            </Sidebar.Item>
          </Sidebar.Group>
        </Sidebar.Root>
      ),
    },
    {
      name: "Folder Tree",
      render: () => (
        <Sidebar.Root>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Folders</Sidebar.GroupLabel>
            <Sidebar.Tree
              aria-label="Folders"
              items={folders}
              defaultExpanded={["design"]}
              defaultValue="inbox"
            >
              <FolderRows items={folders} />
            </Sidebar.Tree>
          </Sidebar.Group>
        </Sidebar.Root>
      ),
    },
  ],
};
