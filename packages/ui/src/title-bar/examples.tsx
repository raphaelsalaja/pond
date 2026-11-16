import { IconArrowLeft, IconLink2 } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { TitleBar } from ".";

export const docs: ComponentDocs = {
  slug: "title-bar",
  name: "Title Bar",
  tier: "navigation",
  summary:
    "Puts a centered title between start and end controls at the window's title bar height.",
  parts: [
    {
      name: "TitleBar.Root",
      description:
        "A three-column grid that keeps the title centered whatever the sides hold.",
    },
    { name: "TitleBar.Start", description: "Controls on the leading edge." },
    {
      name: "TitleBar.Title",
      description: "The centered stack for `Label` and `Meta`.",
    },
    {
      name: "TitleBar.Label",
      description: "The title. Truncates on one line.",
    },
    {
      name: "TitleBar.Meta",
      description: "Secondary text under the label, with tabular numbers.",
    },
    { name: "TitleBar.End", description: "Controls on the trailing edge." },
  ],
  keyboard: [],
  accessibility: [
    "Renders plain containers with no roles. Focus moves through its controls in source order.",
    "`Label` is not a heading. Name the surface it titles separately if it needs one.",
    "Icon-only buttons in `Start` and `End` need an `aria-label`.",
  ],
  examples: [
    {
      name: "Controls",
      render: () => (
        <TitleBar.Root>
          <TitleBar.Start>
            <Button icon size="sm" variant="ghost" aria-label="Back">
              <IconArrowLeft />
            </Button>
          </TitleBar.Start>
          <TitleBar.Title>
            <TitleBar.Label>Brutalist Signage</TitleBar.Label>
            <TitleBar.Meta>3 of 24</TitleBar.Meta>
          </TitleBar.Title>
          <TitleBar.End>
            <Button icon size="sm" variant="ghost" aria-label="Copy Link">
              <IconLink2 />
            </Button>
          </TitleBar.End>
        </TitleBar.Root>
      ),
    },
  ],
};
