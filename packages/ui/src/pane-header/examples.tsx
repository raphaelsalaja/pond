import { IconDots, IconXmark } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Pane } from ".";

export const docs: ComponentDocs = {
  slug: "pane-header",
  name: "Pane",
  tier: "navigation",
  summary:
    "Gives a side pane a header with its title and actions, and a body on the same inset.",
  parts: [
    {
      name: "Pane.Header",
      description:
        "The header bar. `title` sits on the left and children are actions on the right.",
    },
    {
      name: "Pane.Body",
      description:
        "The pane content on a shared horizontal inset. Accepts a `ref`.",
    },
  ],
  keyboard: [],
  accessibility: [
    "`Header` renders a `<header>` and wraps `title` in a plain container, not a heading. Pass a heading as `title` when the pane needs one.",
    "Icon-only actions need an `aria-label`.",
  ],
  examples: [
    {
      name: "Header",
      render: () => (
        <Pane.Header title="Details">
          <Button icon size="sm" variant="ghost" aria-label="More Options">
            <IconDots />
          </Button>
          <Button icon size="sm" variant="ghost" aria-label="Close">
            <IconXmark />
          </Button>
        </Pane.Header>
      ),
    },
    {
      name: "Body",
      render: () => (
        <div style={{ width: 320 }}>
          <Pane.Header title="Koi" />
          <Pane.Body>
            <p>Tags new saves in Design every morning.</p>
          </Pane.Body>
        </div>
      ),
    },
  ],
};
