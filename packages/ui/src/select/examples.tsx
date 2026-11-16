import type { ComponentDocs } from "../shared/docs";
import { Select } from ".";

const SORT = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title", label: "Title" },
];

function SortSelect({
  defaultValue,
  disabled,
}: {
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root items={SORT} defaultValue={defaultValue} disabled={disabled}>
      <Select.Trigger aria-label="Sort Saves">
        <Select.Value placeholder="Sort By" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={SORT} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "select",
  name: "Select",
  tier: "form",
  summary: "Picks one option from a short list in a popup.",
  parts: [
    {
      name: "Select.Root",
      description: "Holds the value, items and open state.",
    },
    {
      name: "Select.Trigger",
      description:
        "The button that opens the list. Takes Button `variant`, `size` and `width`.",
    },
    {
      name: "Select.Value",
      description: "Shows the picked option, or `placeholder`.",
    },
    {
      name: "Select.Portal / Positioner / Popup",
      description: "Places the list in a popup.",
    },
    {
      name: "Select.Items",
      description: "Renders options, groups and separators from a spec.",
    },
    {
      name: "Select.Item / ItemText / ItemIndicator",
      description: "One option, its text and its check mark.",
    },
    {
      name: "Select.Group / GroupLabel / Separator",
      description: "Groups options under a heading.",
    },
  ],
  keyboard: [
    { keys: "Enter / Space / ArrowDown", action: "Opens the list" },
    { keys: "ArrowDown / ArrowUp", action: "Moves the highlight" },
    { keys: "Home / End", action: "Highlights the first or last option" },
    {
      keys: "Typing",
      action: "Highlights the option that starts with the typed text",
    },
    {
      keys: "Enter / Space",
      action: "Picks the highlighted option and closes the list",
    },
    {
      keys: "Escape",
      action: "Closes the list and returns focus to the trigger",
    },
  ],
  accessibility: [
    'The trigger is a `role="combobox"` that controls a `role="listbox"`.',
    "Name the trigger with `aria-label` or `Select.Label`.",
    "The picked option has `aria-selected`.",
  ],
  examples: [
    {
      name: "Placeholder",
      render: () => <SortSelect />,
    },
    {
      name: "Selected",
      render: () => <SortSelect defaultValue="newest" />,
    },
    {
      name: "Disabled",
      render: () => <SortSelect defaultValue="newest" disabled />,
    },
  ],
};
