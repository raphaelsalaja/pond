import type { ComponentDocs } from "../shared/docs";
import { Shell } from ".";

export const docs: ComponentDocs = {
  slug: "shell",
  name: "Shell",
  tier: "navigation",
  summary:
    "Frames a page as a side column beside a scrolling main area with a sticky header.",
  parts: [
    {
      name: "Shell.Body",
      description: "The row that holds `Aside` and `Main`.",
    },
    {
      name: "Shell.Aside",
      description: "The fixed-width side column, rendered as `<aside>`.",
    },
    {
      name: "Shell.Main",
      description:
        "The scrolling `<main>`. Fades its edges and accepts a `ref` for scroll restoration.",
    },
    {
      name: "Shell.Header",
      description: "Sticks to the top of `Main` while it scrolls.",
    },
    {
      name: "Shell.Empty",
      description: "Centered status text for a page with nothing to show.",
    },
    {
      name: "Shell.Drag",
      description:
        "An invisible strip across the top of the window that drags it on macOS.",
    },
  ],
  keyboard: [],
  accessibility: [
    "`Aside` and `Main` are landmarks. Render one `Main` per page and keep `Aside` outside it.",
    "`Header` is a plain `<header>` inside `Main`, so it isn't a page banner.",
    "`Drag` takes no pointer events and holds no content.",
  ],
  examples: [
    {
      name: "Layout",
      render: () => (
        <Shell.Body>
          <Shell.Aside aria-label="Folders">Folders</Shell.Aside>
          <Shell.Main>
            <Shell.Header>Library</Shell.Header>
            <p>128 saves</p>
          </Shell.Main>
        </Shell.Body>
      ),
    },
    {
      name: "Empty",
      render: () => (
        <Shell.Main>
          <Shell.Empty>No saves in this folder</Shell.Empty>
        </Shell.Main>
      ),
    },
  ],
};
