import { Combobox } from ".";
import type { ComponentDocs } from "../shared/docs";

const TAGS = ["Reference", "Design", "Typography", "Moodboard"];

function TagField({
  defaultValue = [],
  disabled,
}: {
  defaultValue?: Array<string>;
  disabled?: boolean;
}) {
  return (
    <Combobox.Root
      multiple
      items={TAGS}
      defaultValue={defaultValue}
      disabled={disabled}
    >
      <Combobox.InputGroup>
        <Combobox.Value>
          {(selected: Array<string>) => (
            <Combobox.Chips>
              {selected.map((tag) => (
                <Combobox.Chip key={tag}>
                  {tag}
                  <Combobox.ChipRemove aria-label={`Remove ${tag}`} />
                </Combobox.Chip>
              ))}
              <Combobox.ChipsInput
                aria-label="Tags"
                placeholder={selected.length > 0 ? "" : "Search…"}
              />
            </Combobox.Chips>
          )}
        </Combobox.Value>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.Empty>No tags found</Combobox.Empty>
            <Combobox.List>
              {(tag: string) => (
                <Combobox.Item key={tag} value={tag}>
                  <Combobox.ItemLabel>{tag}</Combobox.ItemLabel>
                  <Combobox.ItemEnd>
                    <Combobox.ItemIndicator />
                  </Combobox.ItemEnd>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "combobox",
  name: "Combobox",
  tier: "form",
  summary:
    "Filters a list as you type and picks one or more values, shown as chips.",
  parts: [
    {
      name: "Combobox.Root",
      description:
        "Holds the items, value and open state. `multiple` picks several values.",
    },
    {
      name: "Combobox.InputGroup",
      description: "The field frame around chips and input.",
    },
    {
      name: "Combobox.Input / Combobox.ChipsInput",
      description: "The text input you type into.",
    },
    {
      name: "Combobox.Trigger",
      description: "An optional button that opens the list.",
    },
    {
      name: "Combobox.Value",
      description: "Renders the current value, often as chips.",
    },
    {
      name: "Combobox.Chips / Combobox.Chip",
      description: "The picked values.",
    },
    {
      name: "Combobox.ChipRemove",
      description:
        "Removes one chip. Named Remove unless you pass `aria-label`.",
    },
    {
      name: "Combobox.Portal / Positioner / Popup",
      description: "Places the list in a popup.",
    },
    {
      name: "Combobox.List / Item / ItemLabel / ItemIndicator",
      description: "The options and the mark on picked ones.",
    },
    { name: "Combobox.Empty", description: "Shown when nothing matches." },
    {
      name: "Combobox.Group / GroupLabel / Separator",
      description: "Groups options under a heading.",
    },
  ],
  keyboard: [
    { keys: "Typing", action: "Filters the list and opens it" },
    {
      keys: "ArrowDown / ArrowUp",
      action: "Opens the list and moves the highlight",
    },
    { keys: "Enter", action: "Picks the highlighted option" },
    { keys: "Escape", action: "Closes the list and keeps focus in the input" },
  ],
  accessibility: [
    'The input is a `role="combobox"` that controls a `role="listbox"`.',
    "Name the input with `aria-label` or `Combobox.Label`.",
    '`Combobox.ChipRemove` defaults to Remove; pass a specific name such as "Remove Design".',
  ],
  examples: [
    {
      name: "Empty",
      render: () => <TagField />,
    },
    {
      name: "Selected",
      render: () => <TagField defaultValue={["Reference", "Design"]} />,
    },
    {
      name: "Disabled",
      render: () => <TagField defaultValue={["Reference"]} disabled />,
    },
  ],
};
