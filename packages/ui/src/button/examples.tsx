import { IconFolderPlus } from "@pond/icons";
import { Button } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "button",
  name: "Button",
  tier: "form",
  summary: "Runs an action. Icon buttons need an `aria-label`.",
  parts: [
    {
      name: "variant",
      description:
        "primary, secondary, tertiary, ghost, text, accent, destructive, link or bare",
    },
    { name: "size", description: "xs, sm, md, lg or xl" },
    {
      name: "rounding",
      description:
        "full (pill, the default) or rounded for dense rows and grids",
    },
    {
      name: "icon",
      description: "Square icon-only button. Requires `aria-label`.",
    },
    {
      name: "loading",
      description: "Shows a spinner, sets `aria-busy` and disables the button.",
    },
  ],
  keyboard: [
    { keys: "Enter", action: "Activates the button" },
    { keys: "Space", action: "Activates the button" },
  ],
  accessibility: [
    "Renders a native `<button>` through Base UI.",
    "Loading keeps the label for screen readers and sets `aria-busy`.",
  ],
  examples: [
    {
      name: "Variants",
      render: () => (
        <>
          <Button variant="primary">Save</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="tertiary">Details</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Delete</Button>
        </>
      ),
    },
    {
      name: "Sizes",
      render: () => (
        <>
          <Button size="xs">Extra Small</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
        </>
      ),
    },
    {
      name: "Icon",
      render: () => (
        <Button icon variant="ghost" aria-label="New Folder">
          <IconFolderPlus />
        </Button>
      ),
    },
    {
      name: "Rounded",
      render: () => (
        <Button variant="secondary" rounding="rounded">
          Sort Order
        </Button>
      ),
    },
    {
      name: "Loading",
      render: () => <Button loading>Importing</Button>,
    },
  ],
};
