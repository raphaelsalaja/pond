import { Keyboard } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "keyboard",
  name: "Keyboard",
  tier: "content",
  summary: "Shows a keyboard shortcut as key caps beside the command it runs.",
  parts: [
    {
      name: "Keyboard.Shortcut",
      description:
        "Takes one key or an array of keys as children and renders a `Cluster`.",
    },
    {
      name: "Keyboard.Cluster",
      description:
        'Lays out `keys` as caps. Inserts "then" before a trailing punctuation key unless you pass `separator`.',
    },
    { name: "Keyboard.Key", description: "One key cap, rendered as `<kbd>`." },
    {
      name: "density",
      description:
        "default draws caps, inline sizes them to text, flat drops the caps for menus.",
    },
  ],
  keyboard: [],
  accessibility: [
    "`Cluster` and `Shortcut` are hidden from screen readers, since glyphs like ⌘ read poorly.",
    "Expose the shortcut on the control it triggers with `aria-keyshortcuts`.",
    "A standalone `Key` stays readable as `<kbd>`.",
  ],
  examples: [
    {
      name: "Shortcut",
      render: () => (
        <>
          <span>Search</span>
          <Keyboard.Shortcut>{["⌘", "K"]}</Keyboard.Shortcut>
        </>
      ),
    },
    {
      name: "Then",
      render: () => (
        <>
          <span>Settings</span>
          <Keyboard.Shortcut>{["⌘", ","]}</Keyboard.Shortcut>
        </>
      ),
    },
    {
      name: "Flat",
      render: () => (
        <>
          <span>New Folder</span>
          <Keyboard.Shortcut density="flat">
            {["⇧", "⌘", "N"]}
          </Keyboard.Shortcut>
        </>
      ),
    },
    {
      name: "Key",
      render: () => (
        <p>
          Press <Keyboard.Key>Esc</Keyboard.Key> to close the preview.
        </p>
      ),
    },
  ],
};
