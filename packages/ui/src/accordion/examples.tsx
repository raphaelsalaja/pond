import { IconChevronDown } from "@pond/icons";
import { Accordion } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "accordion",
  name: "Accordion",
  tier: "navigation",
  summary: "Stacks sections that open and close under their own headers.",
  parts: [
    {
      name: "Accordion.Root",
      description:
        "Holds the open `value` list. `multiple` lets more than one section stay open.",
    },
    { name: "Accordion.Item", description: "One section, keyed by `value`." },
    {
      name: "Accordion.Header",
      description: "The section heading (`h3`) that wraps the trigger.",
    },
    {
      name: "Accordion.Trigger",
      description:
        'The button that opens and closes the panel. A trailing icon turns when open. `variant="bare"` keeps focus and behavior only.',
    },
    {
      name: "Accordion.Panel",
      description: "The section content. Animates its height.",
    },
  ],
  keyboard: [
    {
      keys: "Tab",
      action:
        "Moves focus to the next trigger, or to a control inside an open panel",
    },
    { keys: "Enter / Space", action: "Opens or closes the focused section" },
  ],
  accessibility: [
    "Each trigger is a native `<button>` inside a heading, with `aria-expanded`.",
    "An open panel is a `region` labelled by its trigger, and the trigger points to it with `aria-controls`.",
    "Panel transitions turn off under reduced motion.",
  ],
  examples: [
    {
      name: "Sections",
      render: () => (
        <Accordion.Root defaultValue={["details"]} style={{ width: 320 }}>
          <Accordion.Item value="details">
            <Accordion.Header>
              <Accordion.Trigger>
                Details
                <IconChevronDown size={12} />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>Saved from Are.na on March 2.</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="tags">
            <Accordion.Header>
              <Accordion.Trigger>
                Tags
                <IconChevronDown size={12} />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel>Typography, Posters</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      ),
    },
  ],
};
