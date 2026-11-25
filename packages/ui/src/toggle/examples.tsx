import { IconBookmark, IconPinTack } from "@pond/icons";
import { Toggle } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "toggle",
  name: "Toggle",
  tier: "form",
  summary:
    "A pressed or unpressed tool button. Icon toggles need an `aria-label`.",
  parts: [
    { name: "variant", description: "ghost or outline" },
    { name: "size", description: "sm or md" },
    {
      name: "icon",
      description: "Square icon-only toggle. Requires `aria-label`.",
    },
  ],
  keyboard: [
    { keys: "Space", action: "Toggles the pressed state" },
    { keys: "Enter", action: "Toggles the pressed state" },
  ],
  accessibility: [
    "Renders a native `<button>` with `aria-pressed`.",
    "Name an icon toggle with `aria-label`; text toggles use their label.",
  ],
  examples: [
    {
      name: "Default",
      render: () => <Toggle>Pinned</Toggle>,
    },
    {
      name: "Pressed",
      render: () => (
        <Toggle variant="outline" defaultPressed>
          Bookmarked
        </Toggle>
      ),
    },
    {
      name: "Icon",
      render: () => (
        <>
          <Toggle icon aria-label="Pin Save">
            <IconPinTack size={16} />
          </Toggle>
          <Toggle icon aria-label="Bookmark Save" defaultPressed>
            <IconBookmark size={16} />
          </Toggle>
        </>
      ),
    },
    {
      name: "Disabled",
      render: () => <Toggle disabled>Pinned</Toggle>,
    },
  ],
};
