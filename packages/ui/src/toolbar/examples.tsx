import { IconFolderPlus, IconMagnifier, IconSliders } from "@pond/icons";
import { Toolbar } from ".";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "toolbar",
  name: "Toolbar",
  tier: "navigation",
  summary:
    "Groups related controls into one tab stop that you move through with the arrow keys.",
  parts: [
    {
      name: "Toolbar.Root",
      description:
        "The `toolbar`. Name it with `aria-label`. Stacks its rows in a column.",
    },
    {
      name: "Toolbar.Row",
      description: "A horizontal line of groups. Layout only.",
    },
    {
      name: "Toolbar.Group",
      description:
        "A `group` of controls. `fill` takes the free space and `align` is start or end.",
    },
    {
      name: "Toolbar.Separator",
      description: "A divider between groups, oriented across the toolbar.",
    },
    {
      name: "Toolbar.Button",
      description: "A roving item. Pass a Pond `Button` through `render`.",
    },
    {
      name: "Toolbar.Input",
      description: "A text field that joins the roving focus.",
    },
    {
      name: "Toolbar.Link",
      description: "A link that joins the roving focus.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Enters the toolbar once, then leaves it" },
    {
      keys: "Left / Right",
      action:
        "Moves focus to the previous or next control, wrapping at the ends",
    },
  ],
  accessibility: [
    'Renders `role="toolbar"` with `aria-orientation` through Base UI.',
    "Only one control is in the tab order. Focus returns to it when you tab back in.",
    "Icon-only buttons need an `aria-label`.",
  ],
  examples: [
    {
      name: "Groups",
      render: () => (
        <Toolbar.Root aria-label="Library">
          <Toolbar.Row>
            <Toolbar.Group aria-label="Find">
              <Toolbar.Button
                render={
                  <Button icon size="sm" variant="ghost" aria-label="Search" />
                }
              >
                <IconMagnifier />
              </Toolbar.Button>
              <Toolbar.Button
                render={
                  <Button icon size="sm" variant="ghost" aria-label="Filter" />
                }
              >
                <IconSliders />
              </Toolbar.Button>
            </Toolbar.Group>
            <Toolbar.Separator />
            <Toolbar.Group fill align="end">
              <Toolbar.Button render={<Button size="sm" variant="secondary" />}>
                <IconFolderPlus size={12} />
                New Folder
              </Toolbar.Button>
            </Toolbar.Group>
          </Toolbar.Row>
        </Toolbar.Root>
      ),
    },
  ],
};
