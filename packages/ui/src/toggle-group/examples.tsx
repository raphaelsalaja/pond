import type { ComponentDocs } from "../shared/docs";
import { Toggle } from "../toggle";
import { ToggleGroup } from ".";

export const docs: ComponentDocs = {
  slug: "toggle-group",
  name: "Toggle Group",
  tier: "form",
  summary:
    "A segmented control where one toggle, or several with `multiple`, stays pressed.",
  parts: [
    {
      name: "ToggleGroup",
      description: "The group. `variant` is raised, outline or tiles.",
    },
    { name: "Toggle", description: "One segment, identified by `value`." },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves focus into the group, then out of it" },
    {
      keys: "Arrow keys",
      action: "Move focus between toggles, wrapping at the ends",
    },
    { keys: "Home / End", action: "Move focus to the first or last toggle" },
    { keys: "Space / Enter", action: "Presses the focused toggle" },
  ],
  accessibility: [
    'The group has `role="group"`; name it with `aria-label`.',
    "Each toggle is a native `<button>` with `aria-pressed`.",
    "Only one toggle is in the tab order at a time.",
  ],
  examples: [
    {
      name: "Raised",
      render: () => (
        <ToggleGroup aria-label="Layout" defaultValue={["grid"]}>
          <Toggle value="grid" size="sm">
            Grid
          </Toggle>
          <Toggle value="list" size="sm">
            List
          </Toggle>
          <Toggle value="table" size="sm">
            Table
          </Toggle>
        </ToggleGroup>
      ),
    },
    {
      name: "Outline",
      render: () => (
        <ToggleGroup
          aria-label="Sort Order"
          variant="outline"
          defaultValue={["newest"]}
        >
          <Toggle value="newest" size="sm">
            Newest
          </Toggle>
          <Toggle value="oldest" size="sm">
            Oldest
          </Toggle>
        </ToggleGroup>
      ),
    },
    {
      name: "Multiple",
      render: () => (
        <ToggleGroup
          aria-label="Show"
          multiple
          defaultValue={["images", "videos"]}
        >
          <Toggle value="images" size="sm">
            Images
          </Toggle>
          <Toggle value="videos" size="sm">
            Videos
          </Toggle>
          <Toggle value="links" size="sm">
            Links
          </Toggle>
        </ToggleGroup>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <ToggleGroup aria-label="Layout" defaultValue={["grid"]} disabled>
          <Toggle value="grid" size="sm">
            Grid
          </Toggle>
          <Toggle value="list" size="sm">
            List
          </Toggle>
        </ToggleGroup>
      ),
    },
  ],
};
