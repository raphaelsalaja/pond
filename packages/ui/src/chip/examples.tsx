import { IconTag } from "@pond/icons";
import { FileIcon } from "../file-icon";
import { Menu } from "../menu";
import type { ComponentDocs } from "../shared/docs";
import { Chip } from ".";

function ignore(): void {}

export const docs: ComponentDocs = {
  slug: "chip",
  name: "Chip",
  tier: "form",
  summary: "A compact tag, mention or filter you can apply, open or remove.",
  parts: [
    { name: "Chip.Root", description: "Lays out a row of chips." },
    {
      name: "Chip.Item",
      description:
        "A static chip. `tone` sets tag, mention, added, removed or file styling.",
    },
    {
      name: "Chip.Action",
      description: "A chip that is a button: applied, suggested or mention.",
    },
    { name: "Chip.Link", description: "A chip that links to a file." },
    { name: "Chip.Icon", description: "A decorative leading icon." },
    { name: "Chip.Label", description: "The chip text, clipped when long." },
    {
      name: "Chip.Clear",
      description:
        "Removes the chip. Named Remove unless you pass `aria-label`.",
    },
    {
      name: "Chip.Filter",
      description:
        "A filter chip that opens a menu, with a clear button named by `clearLabel`.",
    },
    { name: "Chip.Popup", description: "The menu popup for `Chip.Filter`." },
    {
      name: "Chip.Operator / Chip.Trigger",
      description: "Inline buttons for building filter expressions.",
    },
    {
      name: "Chip.Swatch",
      description: "A color dot for color tags and filters.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves between chip buttons and clear buttons" },
    {
      keys: "Enter / Space",
      action: "Activates the focused chip, clear button or filter",
    },
    { keys: "ArrowDown", action: "Opens a filter menu" },
    {
      keys: "Escape",
      action: "Closes a filter menu and returns focus to the chip",
    },
  ],
  accessibility: [
    '`Chip.Clear` defaults to the name Remove; pass a specific `aria-label` such as "Remove Reference".',
    "`Chip.Filter` names its trigger with `ariaLabel` and its clear button with `clearLabel`, which defaults to Clear Filter.",
    "`Chip.Icon` and `Chip.Swatch` are hidden from assistive tech.",
  ],
  examples: [
    {
      name: "Tags",
      render: () => (
        <Chip.Root>
          <Chip.Item tone="tag">
            <Chip.Icon>
              <IconTag size={12} />
            </Chip.Icon>
            <Chip.Label>Reference</Chip.Label>
            <Chip.Clear aria-label="Remove Reference" onClick={ignore} />
          </Chip.Item>
          <Chip.Item tone="tag">
            <Chip.Swatch color="var(--ds-blue)" />
            <Chip.Label>Design</Chip.Label>
          </Chip.Item>
        </Chip.Root>
      ),
    },
    {
      name: "Actions",
      render: () => (
        <Chip.Root>
          <Chip.Action tone="applied">Moodboard</Chip.Action>
          <Chip.Action tone="suggested">Typography</Chip.Action>
        </Chip.Root>
      ),
    },
    {
      name: "File",
      render: () => (
        <Chip.Link href="https://example.com/brief.pdf">
          <Chip.Icon>
            <FileIcon name="brief.pdf" />
          </Chip.Icon>
          <Chip.Label>brief.pdf</Chip.Label>
        </Chip.Link>
      ),
    },
    {
      name: "Filter",
      render: () => (
        <Chip.Filter
          icon={<IconTag size={12} />}
          label="Reference"
          ariaLabel="Tag: Reference"
          active
          clearLabel="Clear Tag Filter"
          onClear={ignore}
        >
          <Chip.Popup aria-label="Tag Filter">
            <Menu.CheckboxItem checked>
              <Menu.CheckboxItemIndicator />
              <Menu.ItemLabel>Reference</Menu.ItemLabel>
            </Menu.CheckboxItem>
          </Chip.Popup>
        </Chip.Filter>
      ),
    },
  ],
};
