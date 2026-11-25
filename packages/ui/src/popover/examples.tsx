import { IconCircleInfo } from "@pond/icons";
import { Popover } from ".";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";

function SourceDetails() {
  return (
    <Popover.Root>
      <Popover.Trigger render={<Button variant="secondary" />}>
        Source Details
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner>
          <Popover.Popup>
            <Popover.Title>Are.na</Popover.Title>
            <Popover.Description>
              Pond fetches new blocks every hour.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AboutTags() {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button icon variant="ghost" aria-label="About Tags" />}
      >
        <IconCircleInfo />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="right">
          <Popover.Popup>
            <Popover.Title>Tags</Popover.Title>
            <Popover.Description>
              A save can have any number of tags.
            </Popover.Description>
            <Popover.Close render={<Button size="sm" variant="secondary" />}>
              Done
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "popover",
  name: "Popover",
  tier: "overlay",
  summary:
    "Shows extra content or controls anchored to a trigger, without blocking the app.",
  parts: [
    { name: "Popover.Root", description: "Holds open state." },
    {
      name: "Popover.Trigger",
      description:
        "The button that toggles the popover. Render a Pond `Button`.",
    },
    {
      name: "Popover.Portal",
      description: "Moves the popover to the end of the document.",
    },
    {
      name: "Popover.Positioner",
      description:
        "Places the popup beside the trigger. Set `side` and `align`.",
    },
    { name: "Popover.Popup", description: "The floating panel." },
    {
      name: "Popover.Arrow",
      description: "Optional pointer toward the trigger.",
    },
    {
      name: "Popover.Title",
      description: "Names the popup through `aria-labelledby`.",
    },
    {
      name: "Popover.Description",
      description: "Describes the popup through `aria-describedby`.",
    },
    { name: "Popover.Close", description: "A button that closes the popover." },
    {
      name: "Popover.Backdrop",
      description: "Optional layer behind a modal popover.",
    },
  ],
  keyboard: [
    { keys: "Enter", action: "Toggles the popover from its trigger" },
    { keys: "Space", action: "Toggles the popover from its trigger" },
    { keys: "Tab", action: "Moves through the popup's controls" },
    {
      keys: "Escape",
      action: "Closes the popover and returns focus to the trigger",
    },
  ],
  accessibility: [
    'The popup has `role="dialog"` and the trigger sets `aria-expanded`.',
    "Opening moves focus into the popup. Closing returns it to the trigger.",
    "Name the popup with `Popover.Title`, or pass `aria-label` to `Popover.Popup`.",
    "Icon triggers need their own `aria-label`.",
  ],
  examples: [
    { name: "Text Trigger", render: () => <SourceDetails /> },
    { name: "Icon Trigger", render: () => <AboutTags /> },
  ],
};
