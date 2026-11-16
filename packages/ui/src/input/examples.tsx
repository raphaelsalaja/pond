import { IconMagnifier } from "@pond/icons";
import type { ComponentDocs } from "../shared/docs";
import { Input } from ".";

export const docs: ComponentDocs = {
  slug: "input",
  name: "Input",
  tier: "form",
  summary:
    "A single-line or multi-line text field with optional icon and affixes.",
  parts: [
    {
      name: "Input.Root",
      description:
        "The frame. `size` is xs to xl; `variant` is primary, secondary or borderless.",
    },
    {
      name: "Input.Field",
      description:
        'The text input. `appearance="bare"` drops the chrome for inline editing.',
    },
    {
      name: "Input.Textarea",
      description:
        'A multi-line field. `sizing="content"` grows with its text.',
    },
    { name: "Input.Icon", description: "A decorative leading icon." },
    {
      name: "Input.Prefix / Input.Suffix",
      description: "Fixed text or a control before or after the field.",
    },
    {
      name: "Input.Action",
      description: "A trailing control slot, such as a clear button.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves focus to the field" },
    {
      keys: "Typing",
      action: "Edits the text without triggering page shortcuts",
    },
  ],
  accessibility: [
    "Renders a native `<input>` or `<textarea>`.",
    "Name it with `Field.Label` or `aria-label`; a placeholder is not a name.",
    "`aria-invalid` turns the text red.",
    "`Input.Icon` is hidden from assistive tech.",
  ],
  examples: [
    {
      name: "Default",
      render: () => (
        <Input.Root>
          <Input.Field aria-label="Library Name" defaultValue="Pond" />
        </Input.Root>
      ),
    },
    {
      name: "Icon",
      render: () => (
        <Input.Root>
          <Input.Icon>
            <IconMagnifier size={16} />
          </Input.Icon>
          <Input.Field aria-label="Search Library" placeholder="Search…" />
        </Input.Root>
      ),
    },
    {
      name: "Prefix",
      render: () => (
        <Input.Root>
          <Input.Prefix>https://</Input.Prefix>
          <Input.Field aria-label="Source URL" defaultValue="are.na" />
        </Input.Root>
      ),
    },
    {
      name: "Invalid",
      render: () => (
        <Input.Root>
          <Input.Field aria-label="Folder Name" aria-invalid defaultValue="/" />
        </Input.Root>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <Input.Root>
          <Input.Field aria-label="Library Name" defaultValue="Pond" disabled />
        </Input.Root>
      ),
    },
  ],
};
