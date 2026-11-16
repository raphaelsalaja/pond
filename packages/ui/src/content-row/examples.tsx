import { IconDots, IconFolder, IconInbox } from "@pond/icons";
import type { ComponentDocs } from "../shared/docs";
import { ContentRow } from ".";

export const docs: ComponentDocs = {
  slug: "content-row",
  name: "Content Row",
  tier: "navigation",
  summary:
    "A full-width row that opens one thing, with an optional icon action at its end.",
  parts: [
    {
      name: "ContentRow.Root",
      description: "The row, rendered as an `<article>` with a bottom divider.",
    },
    {
      name: "ContentRow.Trigger",
      description: "The native button that covers the row's main area.",
    },
    {
      name: "ContentRow.Media",
      description: "The leading icon or image. `size` is icon or thumbnail.",
    },
    {
      name: "ContentRow.Content",
      description: "Stacks `Title` and `Description`.",
    },
    { name: "ContentRow.Title", description: "One line that truncates." },
    {
      name: "ContentRow.Description",
      description: "Up to two lines that clamp.",
    },
    {
      name: "ContentRow.Action",
      description:
        "A ghost icon `Button` beside the trigger. Needs an `aria-label`.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves from the trigger to the action" },
    {
      keys: "Enter / Space",
      action: "Activates the focused trigger or action",
    },
  ],
  accessibility: [
    "The trigger is a native `<button>`, so its title and description become its name.",
    "Keep the action outside the trigger. Buttons can't nest.",
  ],
  examples: [
    {
      name: "Row",
      render: () => (
        <ContentRow.Root style={{ width: 360 }}>
          <ContentRow.Trigger>
            <ContentRow.Media>
              <IconFolder />
            </ContentRow.Media>
            <ContentRow.Content>
              <ContentRow.Title>Design</ContentRow.Title>
              <ContentRow.Description>128 saves</ContentRow.Description>
            </ContentRow.Content>
          </ContentRow.Trigger>
          <ContentRow.Action aria-label="More Options">
            <IconDots />
          </ContentRow.Action>
        </ContentRow.Root>
      ),
    },
    {
      name: "Without Action",
      render: () => (
        <ContentRow.Root style={{ width: 360 }}>
          <ContentRow.Trigger>
            <ContentRow.Media>
              <IconInbox />
            </ContentRow.Media>
            <ContentRow.Content>
              <ContentRow.Title>Inbox</ContentRow.Title>
              <ContentRow.Description>
                Saves land here until you file them into a folder.
              </ContentRow.Description>
            </ContentRow.Content>
          </ContentRow.Trigger>
        </ContentRow.Root>
      ),
    },
  ],
};
